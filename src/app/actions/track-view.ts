"use server";

import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { atomicIncrement } from "@/lib/db";

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

    // Parse and validate the review ID
    const numericId = parseInt(reviewId, 10);
    if (isNaN(numericId)) {
      return;
    }

    // Atomic increment - no race condition on concurrent requests
    await atomicIncrement(numericId, "views");
  } catch (error) {
    console.error("Failed to track view:", error);
    // Be silent on errors to not disrupt user experience
  }
}
