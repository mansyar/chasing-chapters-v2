"use strict";

import { z } from "zod";

// =============================================================================
// Comment Schemas
// =============================================================================

/**
 * Schema for submitting a new comment on a review
 */
export const commentSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters")
    .transform((val) => val.trim()),
  email: z.string().email("Please enter a valid email address"),
  content: z
    .string()
    .min(3, "Comment must be at least 3 characters")
    .max(2000, "Comment must be less than 2000 characters")
    .transform((val) => val.trim()),
  reviewId: z
    .number()
    .int("Review ID must be an integer")
    .positive("Review ID must be positive"),
});

/**
 * Schema for reporting a comment as inappropriate
 */
export const reportCommentSchema = z.object({
  commentId: z
    .number()
    .int("Comment ID must be an integer")
    .positive("Comment ID must be positive"),
  reporterEmail: z.string().email("Please enter a valid email address"),
});

// =============================================================================
// Review Interaction Schemas
// =============================================================================

/**
 * Schema for toggling like on a review
 */
export const likeReviewSchema = z.object({
  reviewId: z.string().regex(/^\d+$/, "Invalid review ID"),
  shouldIncrement: z.boolean(),
});

/**
 * Schema for tracking view on a review
 */
export const trackViewSchema = z.object({
  reviewId: z.string().regex(/^\d+$/, "Invalid review ID"),
});

// =============================================================================
// Type Exports
// =============================================================================

export type CommentInput = z.infer<typeof commentSchema>;
export type ReportCommentInput = z.infer<typeof reportCommentSchema>;
export type LikeReviewInput = z.infer<typeof likeReviewSchema>;
export type TrackViewInput = z.infer<typeof trackViewSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Helper to format Zod validation errors for user-facing messages
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid input";
}
