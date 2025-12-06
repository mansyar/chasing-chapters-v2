"use server";

import { getPayload } from "payload";
import configPromise from "@payload-config";

export async function incrementView(reviewId: string) {
  try {
    const payload = await getPayload({ config: configPromise });

    // Fetch current to get value - in a high scale app we'd want atomic incr
    // Payload doesn't expose raw atomic incr easily via local API yet without custom DB access
    // so read-modify-write is acceptable for this scale.
    const review = await payload.findByID({
      collection: "reviews",
      id: reviewId,
    });

    if (!review) return;

    await payload.update({
      collection: "reviews",
      id: reviewId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        views: ((review as any).views || 0) + 1,
      },
    });
  } catch (error) {
    console.error("Failed to track view:", error);
    // Be silent on errors to not disrupt user experience
  }
}
