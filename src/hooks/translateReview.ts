import type { CollectionAfterChangeHook, Payload } from "payload";
import { logger } from "../lib/logger";
import {
	extractPlainText,
	syncRichTextFormat,
	TranslationError,
	translateRichText,
	translateText,
} from "../lib/translate";
import {
	classifyTranslationError,
	formatTranslationError,
} from "../lib/translation-errors";
import {
	acquireTranslationLock,
	releaseTranslationLock,
} from "../lib/translation-lock";
import { createFailedStatus, isStale } from "../lib/translation-status";
import type { Review } from "../payload-types";

// All localized rich text fields checked for text changes
const richTextFields = [
	"reviewContent",
	"whatILoved",
	"whatCouldBeBetter",
	"perfectFor",
] as const;

/** What the hook decided to do after a review save. */
export type TranslationAction =
	| "translate"
	| "format-sync"
	| "mark-stale"
	| "none";

/**
 * Pure decision logic: given the saved doc, the previous version and the
 * request context, decide which translation pipeline (if any) should run.
 */
export function decideTranslationAction({
	doc,
	previousDoc,
	context,
}: {
	doc: Review;
	previousDoc: Review | null | undefined;
	context?: Record<string, unknown> | null;
}): TranslationAction {
	// Prevent recursion: our own status/content updates re-enter this hook.
	if (context?.skipTranslation) return "none";

	// Only process when published (drafts translate on demand only).
	if (doc._status !== "published") return "none";

	// Check for text changes in any field (requires translation)
	const textChanged = richTextFields.some(
		(field) =>
			extractPlainText(doc[field]) !== extractPlainText(previousDoc?.[field]),
	);

	// Check for any changes including format in any field
	const anyContentChanged = richTextFields.some(
		(field) =>
			JSON.stringify(doc[field]) !== JSON.stringify(previousDoc?.[field]),
	);

	const firstPublish = previousDoc?._status !== "published";
	const wantsTranslation = firstPublish || textChanged;

	// Manual-control mode: never auto-overwrite the Indonesian locale.
	if (doc.autoTranslate === false) {
		if (wantsTranslation) return "mark-stale";
		// Real stale status (FR-8): the pipeline is not about to refresh
		// this translation, so when the recorded translation is date-older
		// than the English content, surface `stale`. Only marked from
		// `translated` so the write always passes the transition map
		// (untranslated/failed/pending cannot legally become stale).
		if (
			doc.translationStatus === "translated" &&
			doc.translationUpdatedAt &&
			isStale(doc.updatedAt, doc.translationUpdatedAt)
		) {
			return "mark-stale";
		}
		return "none";
	}

	if (wantsTranslation) return "translate";
	if (anyContentChanged) return "format-sync";
	return "none";
}

/** Delay before the single automatic re-run after a transient failure (3 minutes). */
export const TRANSLATION_RETRY_DELAY_MS = 3 * 60 * 1000;

/** Options for a translation pipeline run. */
export interface RunPipelineOptions {
	/** True when this run is the automatic re-run after a transient failure. */
	isRetry?: boolean;
	/**
	 * Override the re-run delay (ms). Defaults to TRANSLATION_RETRY_DELAY_MS;
	 * exposed so tests can exercise the delayed re-run without waiting.
	 */
	retryDelayMs?: number;
}

/**
 * Full translation pipeline: marks the review pending, translates all
 * localized fields in batched requests, then saves the Indonesian locale and
 * the final status. On failure the Indonesian locale is left untouched
 * (never overwritten with English) and the status is marked failed.
 *
 * Concurrency: the run is guarded by a per-review lock — a second trigger
 * while a pipeline is already running for the same review is a silent no-op.
 *
 * Transient failures (quota, network, timeout) are retried exactly once
 * automatically after TRANSLATION_RETRY_DELAY_MS; permanent classes
 * (credentials, unexpected) fail immediately with no re-run. The re-run
 * respects the same per-review lock.
 */
export async function runTranslationPipeline(
	payload: Payload,
	doc: Review,
	options: RunPipelineOptions = {},
): Promise<void> {
	const lockToken = await acquireTranslationLock(doc.id);
	if (!lockToken) {
		logger.info(
			`[Translation] Pipeline already running for review ${doc.id}; duplicate trigger ignored.`,
		);
		return;
	}

	try {
		logger.debug(`[Translation] Starting translation for: ${doc.title}`);

		try {
			await payload.update({
				collection: "reviews",
				id: doc.id,
				data: { translationStatus: "pending" },
				context: { skipTranslation: true },
			});

			// Translate rich text fields while preserving structure
			const translatedReviewContent = await translateRichText(
				doc.reviewContent,
			);

			const translatedWhatILoved = doc.whatILoved
				? await translateRichText(doc.whatILoved)
				: null;

			const translatedWhatCouldBeBetter = doc.whatCouldBeBetter
				? await translateRichText(doc.whatCouldBeBetter)
				: null;

			const translatedPerfectFor = doc.perfectFor
				? await translateRichText(doc.perfectFor)
				: null;

			// Translate favorite quotes (plain text array, not rich text)
			const translatedQuotes = doc.favoriteQuotes
				? await Promise.all(
						doc.favoriteQuotes.map(async (item) => ({
							quote: await translateText(item.quote),
							page: item.page,
						})),
					)
				: null;

			logger.debug("[Translation] Saving Indonesian translations...");

			await payload.update({
				collection: "reviews",
				id: doc.id,
				locale: "id",
				data: {
					reviewContent: translatedReviewContent,
					whatILoved: translatedWhatILoved,
					whatCouldBeBetter: translatedWhatCouldBeBetter,
					perfectFor: translatedPerfectFor,
					favoriteQuotes: translatedQuotes,
					translationStatus: "translated",
					translationError: null,
					translationUpdatedAt: new Date().toISOString(),
				},
				context: {
					skipTranslation: true,
				},
			});

			logger.info(`[Translation] Complete for: ${doc.title}`);
		} catch (error) {
			const attempts = error instanceof TranslationError ? error.attempts : 0;
			const classified = classifyTranslationError(error);
			logger.error(
				`[Translation] Failed for: ${doc.title} (${classified.kind})`,
				classified.raw,
			);

			const failed = createFailedStatus(error, attempts);

			try {
				await payload.update({
					collection: "reviews",
					id: doc.id,
					data: {
						translationStatus: failed.status,
						translationError: formatTranslationError(error),
						translationUpdatedAt: new Date().toISOString(),
					},
					context: { skipTranslation: true },
				});
			} catch (statusError) {
				logger.error(
					`[Translation] Could not record failure state for: ${doc.title}`,
					statusError,
				);
			}

			// One automatic re-run for transient failures; permanent classes
			// stop here. The re-run goes through this same function, so it
			// respects the per-review lock and cannot loop further.
			if (!options.isRetry && classified.transient) {
				scheduleTranslationRetry(payload, doc, options.retryDelayMs);
			}
		}
	} finally {
		await releaseTranslationLock(doc.id, lockToken);
	}
}

/**
 * Schedule the single automatic pipeline re-run after a transient failure.
 * In-process setTimeout: a process restart simply loses the timer — the
 * review keeps its recorded state and the notification/bulk-recovery
 * surfaces cover it (per spec's Open Questions decision).
 */
function scheduleTranslationRetry(
	payload: Payload,
	doc: Review,
	retryDelayMs: number = TRANSLATION_RETRY_DELAY_MS,
): void {
	logger.warn(
		`[Translation] Transient failure for review ${doc.id} ("${doc.title}"); scheduling one automatic pipeline re-run in ${retryDelayMs}ms.`,
	);
	const timer = setTimeout(() => {
		logger.info(
			`[Translation] Automatic delayed re-run starting for review ${doc.id}.`,
		);
		void runTranslationPipeline(payload, doc, { isRetry: true });
	}, retryDelayMs);
	// Do not hold the process open just for the retry.
	timer.unref?.();
}

/**
 * Format-only sync: re-applies the English formatting structure to the
 * existing Indonesian text without re-translating.
 */
export async function runFormatSyncPipeline(
	payload: Payload,
	doc: Review,
): Promise<void> {
	logger.debug(`[Translation] Starting format sync for: ${doc.title}`);

	try {
		// Get existing Indonesian version
		const existingDoc = await payload.findByID({
			collection: "reviews",
			id: doc.id,
			locale: "id",
		});

		// Sync format from new English version but keep translated text
		const syncedReviewContent = syncRichTextFormat(
			doc.reviewContent,
			existingDoc.reviewContent,
		);

		const syncedWhatILoved = doc.whatILoved
			? syncRichTextFormat(doc.whatILoved, existingDoc.whatILoved)
			: null;

		const syncedWhatCouldBeBetter = doc.whatCouldBeBetter
			? syncRichTextFormat(doc.whatCouldBeBetter, existingDoc.whatCouldBeBetter)
			: null;

		const syncedPerfectFor = doc.perfectFor
			? syncRichTextFormat(doc.perfectFor, existingDoc.perfectFor)
			: null;

		logger.debug("[Translation] Saving format sync...");

		await payload.update({
			collection: "reviews",
			id: doc.id,
			locale: "id",
			data: {
				reviewContent: syncedReviewContent,
				whatILoved: syncedWhatILoved,
				whatCouldBeBetter: syncedWhatCouldBeBetter,
				perfectFor: syncedPerfectFor,
				// favoriteQuotes unchanged - no format to sync
				translationStatus: "translated",
				translationUpdatedAt: new Date().toISOString(),
			},
			context: {
				skipTranslation: true,
			},
		});

		logger.info(`[Translation] Format sync complete for: ${doc.title}`);
	} catch (error) {
		const attempts = error instanceof TranslationError ? error.attempts : 0;
		logger.error(`[Translation] Format sync failed for: ${doc.title}`, error);

		const failed = createFailedStatus(error, attempts);

		try {
			await payload.update({
				collection: "reviews",
				id: doc.id,
				data: {
					translationStatus: failed.status,
					translationError: formatTranslationError(error),
					translationUpdatedAt: new Date().toISOString(),
				},
				context: { skipTranslation: true },
			});
		} catch (statusError) {
			logger.error(
				`[Translation] Could not record format-sync failure for: ${doc.title}`,
				statusError,
			);
		}
	}
}

/** Mark a review's Indonesian translation as stale (auto-translate disabled). */
export async function markTranslationStale(
	payload: Payload,
	docId: number,
): Promise<void> {
	try {
		await payload.update({
			collection: "reviews",
			id: docId,
			data: { translationStatus: "stale" },
			context: { skipTranslation: true },
		});
		logger.info(`[Translation] Marked stale for review ${docId}`);
	} catch (error) {
		logger.error(
			`[Translation] Could not mark stale for review ${docId}`,
			error,
		);
	}
}

export const translateReview: CollectionAfterChangeHook<Review> = async ({
	doc,
	previousDoc,
	req,
	context,
}) => {
	const action = decideTranslationAction({ doc, previousDoc, context });
	const payload = req.payload;

	switch (action) {
		case "translate":
			void runTranslationPipeline(payload, doc);
			break;
		case "format-sync":
			void runFormatSyncPipeline(payload, doc);
			break;
		case "mark-stale":
			void markTranslationStale(payload, doc.id);
			break;
		case "none":
			break;
	}

	return doc;
};
