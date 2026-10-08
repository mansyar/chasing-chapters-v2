import type { CollectionAfterChangeHook, Payload } from "payload";
import { logger } from "../lib/logger";
import {
	extractPlainText,
	syncRichTextFormat,
	TranslationError,
	translateRichText,
	translateText,
} from "../lib/translate";
import { createFailedStatus, describeFailure } from "../lib/translation-status";

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	doc: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	previousDoc: any;
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
		return wantsTranslation ? "mark-stale" : "none";
	}

	if (wantsTranslation) return "translate";
	if (anyContentChanged) return "format-sync";
	return "none";
}

/**
 * Full translation pipeline: marks the review pending, translates all
 * localized fields in batched requests, then saves the Indonesian locale and
 * the final status. On failure the Indonesian locale is left untouched
 * (never overwritten with English) and the status is marked failed.
 */
export async function runTranslationPipeline(
	payload: Payload,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	doc: any,
): Promise<void> {
	logger.debug(`[Translation] Starting translation for: ${doc.title}`);

	try {
		await payload.update({
			collection: "reviews",
			id: doc.id,
			data: { translationStatus: "pending" },
			context: { skipTranslation: true },
		});

		// Translate rich text fields while preserving structure
		const translatedReviewContent = await translateRichText(doc.reviewContent);

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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					doc.favoriteQuotes.map(async (item: any) => ({
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
		logger.error(
			`[Translation] Failed for: ${doc.title}`,
			describeFailure(error, attempts),
		);

		const failed = createFailedStatus(error, attempts);

		try {
			await payload.update({
				collection: "reviews",
				id: doc.id,
				data: {
					translationStatus: failed.status,
					translationError: describeFailure(error, attempts),
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
	}
}

/**
 * Format-only sync: re-applies the English formatting structure to the
 * existing Indonesian text without re-translating.
 */
export async function runFormatSyncPipeline(
	payload: Payload,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	doc: any,
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(existingDoc as any).reviewContent,
		);

		const syncedWhatILoved = doc.whatILoved
			? syncRichTextFormat(doc.whatILoved, (existingDoc as any).whatILoved)
			: null;

		const syncedWhatCouldBeBetter = doc.whatCouldBeBetter
			? syncRichTextFormat(
					doc.whatCouldBeBetter,
					(existingDoc as any).whatCouldBeBetter,
				)
			: null;

		const syncedPerfectFor = doc.perfectFor
			? syncRichTextFormat(doc.perfectFor, (existingDoc as any).perfectFor)
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
					translationError: describeFailure(error, attempts),
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

export const translateReview: CollectionAfterChangeHook = async ({
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
