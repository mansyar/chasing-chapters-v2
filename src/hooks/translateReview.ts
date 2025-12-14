import type { CollectionAfterChangeHook } from "payload";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import {
  translateText,
  extractPlainText,
  createRichTextFromPlain,
} from "../lib/translate";

// Run translation in background (don't block the publish)
async function runTranslationInBackground(
  docId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any
) {
  console.log(
    `[Translation] Starting background translation for: ${doc.title}`
  );

  try {
    // Translate rich text fields
    const translatedReviewContent = await translateText(
      extractPlainText(doc.reviewContent)
    );

    const translatedWhatILoved = doc.whatILoved
      ? await translateText(extractPlainText(doc.whatILoved))
      : null;

    const translatedWhatCouldBeBetter = doc.whatCouldBeBetter
      ? await translateText(extractPlainText(doc.whatCouldBeBetter))
      : null;

    const translatedPerfectFor = doc.perfectFor
      ? await translateText(extractPlainText(doc.perfectFor))
      : null;

    // Translate favorite quotes (don't include id - Payload will generate new ones)
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

    // Get a fresh Payload instance for the background task
    const payload = await getPayload({ config: configPromise });

    // Update the Indonesian locale version
    await payload.update({
      collection: "reviews",
      id: docId,
      locale: "id",
      data: {
        reviewContent: createRichTextFromPlain(translatedReviewContent),
        whatILoved: translatedWhatILoved
          ? createRichTextFromPlain(translatedWhatILoved)
          : null,
        whatCouldBeBetter: translatedWhatCouldBeBetter
          ? createRichTextFromPlain(translatedWhatCouldBeBetter)
          : null,
        perfectFor: translatedPerfectFor
          ? createRichTextFromPlain(translatedPerfectFor)
          : null,
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

  // Only translate when published
  if (doc._status !== "published") return doc;

  // Check if we need to translate
  const wasPublished = previousDoc?._status === "published";
  const contentChanged =
    extractPlainText(doc.reviewContent) !==
    extractPlainText(previousDoc?.reviewContent);

  if (wasPublished && !contentChanged) {
    return doc;
  }

  // Run translation in background - don't await!
  // This allows the publish to complete immediately
  runTranslationInBackground(doc.id, doc).catch((err) => {
    console.error("[Translation] Background task error:", err);
  });

  return doc;
};
