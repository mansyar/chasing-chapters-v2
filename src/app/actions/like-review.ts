"use server";

import { getPayload } from "payload";
import configPromise from "@payload-config";
import { revalidatePath } from "next/cache";

export async function toggleLikeReview(
  reviewId: string,
  shouldIncrement: boolean
): Promise<{ success: boolean; newLikes?: number; error?: string }> {
  try {
    const payload = await getPayload({ config: configPromise });

    // Convert string ID to number (Payload CMS with PostgreSQL uses numeric IDs)
    const numericId = parseInt(reviewId, 10);
    if (isNaN(numericId)) {
      return { success: false, error: "Invalid review ID" };
    }

    // 1. Fetch current review data to get current likes
    const review = await payload.findByID({
      collection: "reviews",
      id: numericId,
    });

    if (!review) {
      return { success: false, error: "Review not found" };
    }

    const currentLikes = review.likes || 0;

    // 2. Calculate new likes
    // Ensure we don't go below 0
    let newLikes = shouldIncrement ? currentLikes + 1 : currentLikes - 1;
    if (newLikes < 0) newLikes = 0;

    // 3. Update the review
    // We update ONLY the likes field.
    // NOTE: In a real high-traffic app, we would use a more atomic operation
    // or a separate table for likes to prevent race conditions.
    // For this app, this read-modify-write pattern is likely sufficient.
    const updatedReview = await payload.update({
      collection: "reviews",
      id: numericId,
      data: {
        likes: newLikes,
      },
      // Override access control - likes can be updated by anyone viewing the page
      overrideAccess: true,
      // Don't create a new draft version - just update the current document
      draft: false,
      // Provide depth 0 to avoid populating relationships which can cause validation issues
      depth: 0,
    });

    // 4. Revalidate the page so the static generation or cache is updated
    // We assume the path structure is /reviews/[slug] but since we only have ID here
    // we might need to rely on the client to see the optimistic update or
    // revalidate the specific path if we had the slug.
    // Ideally we revalidate the specific path, but revalidating the general reviews page might be helpful too.
    // For now, let's return the new value and let the client be happy.
    if (updatedReview.slug) {
      revalidatePath(`/reviews/${updatedReview.slug}`);
    }

    return { success: true, newLikes: updatedReview.likes || 0 };
  } catch (error) {
    console.error("Error toggling like:", error);
    return { success: false, error: "Failed to update likes" };
  }
}
