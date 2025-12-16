"use server";

import { getPayload } from "payload";
import configPromise from "@payload-config";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { atomicIncrement, atomicDecrement } from "@/lib/db";

export async function toggleLikeReview(
  reviewId: string,
  shouldIncrement: boolean
): Promise<{ success: boolean; newLikes?: number; error?: string }> {
  try {
    // Rate limit: 5 likes per minute per review per IP
    const headersList = await headers();
    const ip = getClientIP(headersList);
    const rateLimitResult = await rateLimit(`like:${ip}:${reviewId}`, 5, 60);

    if (!rateLimitResult.success) {
      return {
        success: false,
        error: `Too many requests. Please wait ${rateLimitResult.resetInSeconds} seconds.`,
      };
    }

    // Convert string ID to number (Payload CMS with PostgreSQL uses numeric IDs)
    const numericId = parseInt(reviewId, 10);
    if (isNaN(numericId)) {
      return { success: false, error: "Invalid review ID" };
    }

    // Atomic increment/decrement - no race condition on concurrent requests
    const newLikes = shouldIncrement
      ? await atomicIncrement(numericId, "likes")
      : await atomicDecrement(numericId, "likes");

    if (newLikes === null) {
      return { success: false, error: "Review not found" };
    }

    // Revalidate the page so the static generation or cache is updated
    const payload = await getPayload({ config: configPromise });
    const review = await payload.findByID({
      collection: "reviews",
      id: numericId,
      depth: 0,
    });

    if (review?.slug) {
      revalidatePath(`/reviews/${review.slug}`);
    }

    return { success: true, newLikes };
  } catch (error) {
    console.error("Error toggling like:", error);
    return { success: false, error: "Failed to update likes" };
  }
}
