import type { CollectionAfterChangeHook } from "payload";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import {
  translateText,
  translateRichText,
  extractPlainText,
  syncRichTextFormat,
} from "../lib/translate";

// Run full translation in background (when text changed)
async function runTranslationInBackground(
  docId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any
) {
  console.log(
    `[Translation] Starting background translation for: ${doc.title}`
  );

  try {
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
          }))
        )
      : null;

    console.log("[Translation] Saving Indonesian translations...");

    const payload = await getPayload({ config: configPromise });

    await payload.update({
      collection: "reviews",
      id: docId,
      locale: "id",
      data: {
        reviewContent: translatedReviewContent,
        whatILoved: translatedWhatILoved,
        whatCouldBeBetter: translatedWhatCouldBeBetter,
        perfectFor: translatedPerfectFor,
        favoriteQuotes: translatedQuotes,
      },
      context: {
        skipTranslation: true,
      },
    });

    console.log(`[Translation] Complete for: ${doc.title}`);
  } catch (error) {
    console.error("[Translation] Background translation failed:", error);
  }
}

// Sync format only in background (when only formatting changed, not text)
async function runFormatSyncInBackground(
  docId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any
) {
  console.log(`[Translation] Starting format sync for: ${doc.title}`);

  try {
    const payload = await getPayload({ config: configPromise });

    // Get existing Indonesian version
    const existingDoc = await payload.findByID({
      collection: "reviews",
      id: docId,
      locale: "id",
    });

    // Sync format from new English version but keep translated text
    const syncedReviewContent = syncRichTextFormat(
      doc.reviewContent,
      existingDoc.reviewContent
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

    console.log("[Translation] Saving format sync...");

    await payload.update({
      collection: "reviews",
      id: docId,
      locale: "id",
      data: {
        reviewContent: syncedReviewContent,
        whatILoved: syncedWhatILoved,
        whatCouldBeBetter: syncedWhatCouldBeBetter,
        perfectFor: syncedPerfectFor,
        // favoriteQuotes unchanged - no format to sync
      },
      context: {
        skipTranslation: true,
      },
    });

    console.log(`[Translation] Format sync complete for: ${doc.title}`);
  } catch (error) {
    console.error("[Translation] Format sync failed:", error);
  }
}

export const translateReview: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  context,
}) => {
  // Prevent recursion
  if (context?.skipTranslation) {
    console.log("[Translation] Skipping - context.skipTranslation is set");
    return doc;
  }

  // Only process when published
  if (doc._status !== "published") return doc;

  const wasPublished = previousDoc?._status === "published";

  // All localized rich text fields to check
  const richTextFields = [
    "reviewContent",
    "whatILoved",
    "whatCouldBeBetter",
    "perfectFor",
  ] as const;

  // Check for text changes in any field (requires translation)
  const textChanged = richTextFields.some(
    (field) =>
      extractPlainText(doc[field]) !== extractPlainText(previousDoc?.[field])
  );

  // Check for any changes including format in any field
  const anyContentChanged = richTextFields.some(
    (field) =>
      JSON.stringify(doc[field]) !== JSON.stringify(previousDoc?.[field])
  );

  if (!wasPublished || textChanged) {
    // First publish or text changed - full translation
    runTranslationInBackground(doc.id, doc).catch((err) => {
      console.error("[Translation] Background task error:", err);
    });
  } else if (anyContentChanged) {
    // Format only changed - sync format without re-translating
    runFormatSyncInBackground(doc.id, doc).catch((err) => {
      console.error("[Translation] Format sync error:", err);
    });
  }

  return doc;
};
