import type {
	CollectionAfterChangeHook,
	CollectionBeforeChangeHook,
	Payload,
	PayloadRequest,
} from "payload";
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
 * Whether a rich-text field carried by `next` has different plain text than
 * the same field in `previous`.
 *
 * Only fields present in `next` are compared: a write that carries no
 * rich-text field at all (the pipeline's status writes) cannot have changed
 * the English content. Plain text is compared, not the serialized markup, so
 * a format-only change (same words, different markup) is not a content
 * change.
 */
export function englishContentChanged({
	next,
	previous,
}: {
	next: Partial<Review> | null | undefined;
	previous: Partial<Review> | null | undefined;
}): boolean {
	return richTextFields.some((field) => {
		const nextValue = next?.[field];
		if (nextValue === undefined) return false;
		return extractPlainText(nextValue) !== extractPlainText(previous?.[field]);
	});
}

/**
 * Whether this save changed the English rich text: a text edit or the first
 * publish. This is the only change that moves the English content's change
 * time, so it decides both the translation trigger and the
 * `englishUpdatedAt` write.
 */
export function isEnglishContentChanged({
	doc,
	previousDoc,
}: {
	doc: Review;
	previousDoc: Review | null | undefined;
}): boolean {
	const firstPublish = previousDoc?._status !== "published";
	return (
		firstPublish || englishContentChanged({ next: doc, previous: previousDoc })
	);
}

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
	const wantsTranslation = isEnglishContentChanged({ doc, previousDoc });

	// Check for any changes including format in any field
	const anyContentChanged = richTextFields.some(
		(field) =>
			JSON.stringify(doc[field]) !== JSON.stringify(previousDoc?.[field]),
	);

	// Manual-control mode: never auto-overwrite the Indonesian locale.
	if (doc.autoTranslate === false) {
		if (wantsTranslation) return "mark-stale";
		// Real stale status (FR-8): the pipeline is not about to refresh
		// this translation, so when the recorded translation is date-older
		// than the English content, surface `stale`. Only marked from
		// `translated` so the write always passes the transition map
		// (untranslated/failed/pending cannot legally become stale).
		//
		// The comparison uses the English content's own change time, never
		// the document's `updatedAt`: Payload restamps `updatedAt` on every
		// write — including the pipeline's own translation write — so it
		// would mark every translated review stale. Reviews that predate
		// the field have no recorded English change time and are left as
		// they are.
		if (
			doc.translationStatus === "translated" &&
			doc.englishUpdatedAt &&
			doc.translationUpdatedAt &&
			isStale(doc.englishUpdatedAt, doc.translationUpdatedAt)
		) {
			return "mark-stale";
		}
		return "none";
	}

	if (wantsTranslation) return "translate";
	if (anyContentChanged) return "format-sync";
	return "none";
}

/**
 * Record when the English content last changed — written into the incoming
 * data by a `beforeChange` hook, so the outer UPDATE writes the column in the
 * same transaction: one write, one transaction, one version.
 *
 * A nested `payload.update` from the `afterChange` hook cannot be used here:
 * the Local API always builds a fresh request without a transaction ID, so
 * the nested call opens a second transaction on a second pooled connection
 * and waits for the row lock the outer transaction already holds — the two
 * block each other and every admin save of a changed review hangs.
 */
export const recordEnglishChangeTime: CollectionBeforeChangeHook<Review> = ({
	data,
	operation,
	originalDoc,
	req,
}) => {
	// Only a write against the default locale can change the English content.
	// The translation pipeline writes the Indonesian locale; it must never
	// stamp the English change time.
	const defaultLocale = resolveDefaultLocale(req);
	if (req.locale && req.locale !== defaultLocale) return data;

	if (operation === "create") {
		data.englishUpdatedAt = new Date().toISOString();
		return data;
	}

	// An update only stamps when it actually carries changed English text:
	// a format-only change (same words, different markup) and a write that
	// carries no rich-text field at all (the pipeline's status writes) do not.
	if (englishContentChanged({ next: data, previous: originalDoc })) {
		data.englishUpdatedAt = new Date().toISOString();
	}

	return data;
};

/** The locale the English content lives in. */
function resolveDefaultLocale(req: PayloadRequest): string {
	const localization = req.payload.config.localization;
	if (localization && typeof localization === "object") {
		return localization.defaultLocale;
	}
	return "en";
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
			// The moment the failed run gave up. The delayed re-run compares
			// the review's translation timestamp against it: a newer one
			// means a later run already produced a translation.
			const failedAt = new Date().toISOString();

			try {
				await payload.update({
					collection: "reviews",
					id: doc.id,
					data: {
						translationStatus: failed.status,
						translationError: formatTranslationError(error),
						translationUpdatedAt: failedAt,
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
				scheduleTranslationRetry(
					payload,
					doc.id,
					failedAt,
					options.retryDelayMs,
				);
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
	reviewId: number,
	failedAt: string,
	retryDelayMs: number = TRANSLATION_RETRY_DELAY_MS,
): void {
	logger.warn(
		`[Translation] Transient failure for review ${reviewId}; scheduling one automatic pipeline re-run in ${retryDelayMs}ms.`,
	);
	const timer = setTimeout(() => {
		void runDelayedTranslationRetry(payload, reviewId, failedAt);
	}, retryDelayMs);
	// Do not hold the process open just for the retry.
	timer.unref?.();
}

/**
 * The delayed re-run reads the review again before translating. The retry
 * window is minutes long, so the review may have been edited, re-translated,
 * unpublished, or deleted in the meantime — translating the snapshot taken
 * at failure time would overwrite a newer translation with older content.
 */
async function runDelayedTranslationRetry(
	payload: Payload,
	reviewId: number,
	failedAt: string,
): Promise<void> {
	let fresh: Review;
	try {
		fresh = await payload.findByID({
			collection: "reviews",
			id: reviewId,
			locale: "en",
			depth: 0,
		});
	} catch {
		logger.info(
			`[Translation] Delayed re-run skipped for review ${reviewId}: the review no longer exists.`,
		);
		return;
	}

	if (fresh._status !== "published") {
		logger.info(
			`[Translation] Delayed re-run skipped for review ${reviewId}: the review is no longer published.`,
		);
		return;
	}

	if (isNewerThan(fresh.translationUpdatedAt, failedAt)) {
		logger.info(
			`[Translation] Delayed re-run skipped for review ${reviewId}: a newer translation already exists.`,
		);
		return;
	}

	logger.info(
		`[Translation] Automatic delayed re-run starting for review ${reviewId}.`,
	);
	await runTranslationPipeline(payload, fresh, { isRetry: true });
}

/**
 * Whether a timestamp is strictly newer than a reference timestamp. The
 * delayed re-run uses it to detect a translation that already succeeded
 * after the failed run gave up.
 */
function isNewerThan(
	candidate: string | null | undefined,
	reference: string,
): boolean {
	if (!candidate) return false;
	const candidateTime = new Date(candidate).getTime();
	const referenceTime = new Date(reference).getTime();
	if (Number.isNaN(candidateTime) || Number.isNaN(referenceTime)) return false;
	return candidateTime > referenceTime;
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
			// The English change time was already written by the
			// `beforeChange` hook, in the same transaction as this save.
			// The pipeline is deliberately not awaited: a nested write from
			// this hook would wait for the row lock the outer transaction
			// holds and deadlock the save.
			void runTranslationPipeline(payload, doc);
			break;
		case "format-sync":
			// A format-only change does not change the English content, so
			// the English change time stays where it is.
			void runFormatSyncPipeline(payload, doc);
			break;
		case "mark-stale":
			// Only a real English content change moves the English change
			// time, and that stamp is written by the `beforeChange` hook.
			void markTranslationStale(payload, doc.id);
			break;
		case "none":
			break;
	}

	return doc;
};
