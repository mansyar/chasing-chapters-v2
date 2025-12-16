"use server";

import { getPayload } from "payload";
import configPromise from "@payload-config";
import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

export async function incrementView(reviewId: string) {
  try {
    // Rate limit: 1 view per minute per review per IP (prevents refresh spam)
    const headersList = await headers();
    const ip = getClientIP(headersList);
    const rateLimitResult = await rateLimit(`view:${ip}:${reviewId}`, 1, 60);

    // Silently ignore rate-limited view tracking
    if (!rateLimitResult.success) {
      return;
    }

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
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        views: ((review as any).views || 0) + 1,
      },
    });
  } catch (error) {
    console.error("Failed to track view:", error);
    // Be silent on errors to not disrupt user experience
  }
}
