"use client";

import { useEffect, useRef } from "react";
import { incrementView } from "@/app/actions/track-view";

export function ViewTracker({ reviewId }: { reviewId: string }) {
  const initialized = useRef(false);

  useEffect(() => {
    // Prevent double invocation in strict mode
    if (initialized.current) return;
    initialized.current = true;

    // Check session storage to deduplicate views in the same session
    const storageKey = `viewed_review_${reviewId}`;
    if (sessionStorage.getItem(storageKey)) {
      return;
    }

    // Mark as viewed
    sessionStorage.setItem(storageKey, "true");

    // Fire and forget
    incrementView(reviewId);
  }, [reviewId]);

  return null;
}
