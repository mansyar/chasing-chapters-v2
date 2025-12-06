"use client";

import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleLikeReview } from "@/app/actions/like-review";
import { cn } from "@/lib/utils";

interface LikeButtonProps {
  reviewId: string;
  initialLikes: number;
  className?: string;
}

export function LikeButton({
  reviewId,
  initialLikes,
  className,
}: LikeButtonProps) {
  // Optimistic state
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Load liked state from local storage on mount
  useEffect(() => {
    setIsMounted(true);
    const storageKey = `chasing_chapters_liked_${reviewId}`;
    const liked = localStorage.getItem(storageKey) === "true";
    setIsLiked(liked);
  }, [reviewId]);

  const handleLike = async () => {
    if (isLoading) return;

    // 1. Calculate new state
    const newIsLiked = !isLiked;
    const newLikes = newIsLiked ? likes + 1 : likes - 1;

    // 2. Optimistic Update
    setIsLiked(newIsLiked);
    setLikes(newLikes);
    setIsLoading(true);

    // 3. Persist to Local Storage
    const storageKey = `chasing_chapters_liked_${reviewId}`;
    if (newIsLiked) {
      localStorage.setItem(storageKey, "true");
    } else {
      localStorage.removeItem(storageKey);
    }

    try {
      // 4. Call Server Action
      const result = await toggleLikeReview(reviewId, newIsLiked);

      if (!result.success) {
        // Revert on failure
        setIsLiked(!newIsLiked);
        setLikes(likes); // Revert to original
        console.error("Failed to like:", result.error);
        // Also revert local storage
        if (!newIsLiked) {
          // If we tried to UNLIKE and failed, put it back
          localStorage.setItem(storageKey, "true");
        } else {
          // If we tried to LIKE and failed, remove it
          localStorage.removeItem(storageKey);
        }
      } else if (result.newLikes !== undefined) {
        // Update with server truth if available (though optimistic is usually fine)
        setLikes(result.newLikes);
      }
    } catch (error) {
      console.error("Error in handleLike:", error);
      // Revert everything
      setIsLiked(!newIsLiked);
      setLikes(likes);
    } finally {
      setIsLoading(false);
    }
  };

  // Prevent hydration mismatch for local storage dependent state if needed,
  // but here we only render the "filled" state which might match server if we tracked it there.
  // Since we rely on client-side storage for "isLiked", the server always renders "not liked" visually initially?
  // Actually, if we want to avoid hydration mismatch, we should wait until mounted to show the "filled" state
  // OR strictly separate server/client rendering.
  // Simple fix: rendering the heart filled depends on `isLiked` which defaults to false.
  // Effect sets it to true. This might cause a flicker.
  // To avoid flicker and hydration warnings, we can suppress warning or accept the flicker.
  // Better yet: effectively `disabled` or loading until mounted? No, that feels slow.
  // Standard pattern: default false (consistent with server), then useEffect updates it.

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "gap-2 transition-all hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-950/30",
        isLiked && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/30",
        className
      )}
      onClick={handleLike}
      disabled={!isMounted}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-all",
          isLiked && "fill-current scale-110"
        )}
      />
      <span className="min-w-[2ch] tabular-nums">{likes}</span>
      <span className="sr-only">Likes</span>
    </Button>
  );
}
