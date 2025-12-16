import { revalidatePath } from "next/cache";
import type { CollectionAfterChangeHook } from "payload";

/**
 * Revalidates cached pages when a Review is published or updated.
 * This ensures that ISR-cached pages show new content immediately.
 */
export const revalidateReviewPages: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  // Revalidate when:
  // 1. A new review is created and published
  // 2. An existing review is updated (status change, content change, featured toggle)
  const wasPublished = previousDoc?._status === "published";
  const isPublished = doc._status === "published";
  const justPublished = !wasPublished && isPublished;
  const wasUnpublished = wasPublished && !isPublished;
  const contentChanged = wasPublished && isPublished;

  if (
    justPublished ||
    wasUnpublished ||
    contentChanged ||
    operation === "create"
  ) {
    console.log(
      `[Revalidation] Review "${doc.title}" changed, revalidating pages...`
    );

    // Revalidate the browse page
    revalidatePath("/reviews");

    // Revalidate the individual review page
    if (doc.slug) {
      revalidatePath(`/reviews/${doc.slug}`);
    }

    // Revalidate homepage (featured reviews, latest reviews)
    revalidatePath("/");

    // If featured status changed, homepage needs update (already covered above)
    // Reading lists that include this review will be revalidated by their own ISR
  }

  return doc;
};

/**
 * Revalidates cached pages when a Reading List is published or updated.
 */
export const revalidateReadingListPages: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  const wasPublished = previousDoc?._status === "published";
  const isPublished = doc._status === "published";
  const justPublished = !wasPublished && isPublished;
  const wasUnpublished = wasPublished && !isPublished;
  const contentChanged = wasPublished && isPublished;

  if (
    justPublished ||
    wasUnpublished ||
    contentChanged ||
    operation === "create"
  ) {
    console.log(
      `[Revalidation] Reading List "${doc.title}" changed, revalidating pages...`
    );

    // Revalidate the reading lists index page
    revalidatePath("/reading-lists");

    // Revalidate the individual reading list page
    if (doc.slug) {
      revalidatePath(`/reading-lists/${doc.slug}`);
    }

    // Revalidate homepage (featured reading lists)
    revalidatePath("/");
  }

  return doc;
};
