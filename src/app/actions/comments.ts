"use server";

import { getPayload } from "payload";
import configPromise from "@payload-config";
import { revalidatePath } from "next/cache";
import { isSpamContent } from "@/lib/blocklist";
import { hashEmail } from "@/lib/utils";
import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

// Types for action responses
type ActionResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string };

interface CommentFormData {
  name: string;
  email: string;
  content: string;
  reviewId: number;
}

/**
 * Submit a new comment on a review
 */
export async function submitComment(
  formData: CommentFormData
): Promise<ActionResult<{ status: string }>> {
  try {
    // Rate limit: 3 comments per minute per IP
    const headersList = await headers();
    const ip = getClientIP(headersList);
    const rateLimitResult = await rateLimit(`comment:${ip}`, 3, 60);

    if (!rateLimitResult.success) {
      return {
        success: false,
        error: `Too many comments. Please wait ${rateLimitResult.resetInSeconds} seconds.`,
      };
    }

    const payload = await getPayload({ config: configPromise });
    const { name, email, content, reviewId } = formData;

    // Validate input
    if (!name || name.trim().length < 2) {
      return { success: false, error: "Name must be at least 2 characters" };
    }
    if (!email || !email.includes("@")) {
      return { success: false, error: "Please enter a valid email address" };
    }
    if (!content || content.trim().length < 3) {
      return {
        success: false,
        error: "Comment must be at least 3 characters",
      };
    }
    if (content.length > 2000) {
      return {
        success: false,
        error: "Comment must be less than 2000 characters",
      };
    }

    // Verify review exists and is published
    const targetReview = await payload.findByID({
      collection: "reviews",
      id: reviewId,
      depth: 0,
    });

    if (!targetReview) {
      return { success: false, error: "Review not found" };
    }

    // Check if review is published (handle both draft system and legacy)
    if (targetReview._status && targetReview._status !== "published") {
      return { success: false, error: "Review not found" };
    }

    // Find or create commenter (using hashed email for privacy)
    const hashedEmail = hashEmail(email);
    let commenter;
    const existingCommenters = await payload.find({
      collection: "commenters",
      where: {
        emailHash: {
          equals: hashedEmail,
        },
      },
      limit: 1,
    });

    if (existingCommenters.docs.length > 0) {
      commenter = existingCommenters.docs[0];

      // Check if banned
      if (commenter.banned) {
        return {
          success: false,
          error: "You are not allowed to comment.",
        };
      }

      // Update name if changed
      if (commenter.name !== name.trim()) {
        await payload.update({
          collection: "commenters",
          id: commenter.id,
          data: { name: name.trim() },
        });
      }
    } else {
      // Create new commenter
      commenter = await payload.create({
        collection: "commenters",
        data: {
          name: name.trim(),
          emailHash: hashedEmail,
          approvedCommentCount: 0,
          trusted: false,
          banned: false,
        },
      });
    }

    // Determine initial status - auto-approve unless flagged as spam
    const contentFlagged = isSpamContent(content);
    const status: "pending" | "approved" = contentFlagged
      ? "pending"
      : "approved";

    // Create the comment
    await payload.create({
      collection: "comments",
      data: {
        authorName: name.trim(),
        content: content.trim(),
        relatedReview: reviewId,
        commenter: commenter.id,
        status: status,
        reportCount: 0,
      },
    });

    // Revalidate the review page to show new comment (if approved)
    const review = await payload.findByID({
      collection: "reviews",
      id: reviewId,
    });
    if (review?.slug) {
      revalidatePath(`/reviews/${review.slug}`);
    }

    if (status === "approved") {
      return {
        success: true,
        data: { status: "approved" },
        message: "Your comment has been posted!",
      };
    } else {
      return {
        success: true,
        data: { status: "pending" },
        message:
          "Your comment has been submitted and is pending moderation. It will appear once approved.",
      };
    }
  } catch (error) {
    console.error("Error submitting comment:", error);
    return {
      success: false,
      error:
        "An error occurred while submitting your comment. Please try again.",
    };
  }
}

/**
 * Report a comment as inappropriate
 */
export async function reportComment(
  commentId: number,
  reporterEmail: string
): Promise<ActionResult> {
  try {
    // Rate limit: 5 reports per 5 minutes per IP
    const headersList = await headers();
    const ip = getClientIP(headersList);
    const rateLimitResult = await rateLimit(`report:${ip}`, 5, 300);

    if (!rateLimitResult.success) {
      return {
        success: false,
        error: `Too many reports. Please wait ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
      };
    }

    const payload = await getPayload({ config: configPromise });

    // Validate email
    if (!reporterEmail || !reporterEmail.includes("@")) {
      return { success: false, error: "Please enter a valid email address" };
    }

    // Get the comment
    const comment = await payload.findByID({
      collection: "comments",
      id: commentId,
    });

    if (!comment) {
      return { success: false, error: "Comment not found" };
    }

    // Check if already reported by this email
    const alreadyReported = comment.reportedBy?.some(
      (r) => r.email?.toLowerCase() === reporterEmail.toLowerCase()
    );

    if (alreadyReported) {
      return {
        success: false,
        error: "You have already reported this comment",
      };
    }

    // Update report count and add reporter
    const newReportCount = (comment.reportCount || 0) + 1;
    const newReportedBy = [
      ...(comment.reportedBy || []),
      {
        email: reporterEmail.toLowerCase(),
        reportedAt: new Date().toISOString(),
      },
    ];

    // If 3+ reports, change status to reported
    const newStatus = newReportCount >= 3 ? "reported" : comment.status;

    await payload.update({
      collection: "comments",
      id: commentId,
      data: {
        reportCount: newReportCount,
        reportedBy: newReportedBy,
        status: newStatus,
      },
    });

    return {
      success: true,
      message: "Thank you for your report. We will review this comment.",
    };
  } catch (error) {
    console.error("Error reporting comment:", error);
    return {
      success: false,
      error: "An error occurred while reporting. Please try again.",
    };
  }
}

/**
 * Get approved comments for a review
 */
export async function getApprovedComments(reviewId: number) {
  try {
    const payload = await getPayload({ config: configPromise });

    const { docs: comments } = await payload.find({
      collection: "comments",
      where: {
        relatedReview: {
          equals: reviewId,
        },
        status: {
          equals: "approved",
        },
      },
      sort: "-createdAt",
      limit: 100,
    });

    return {
      success: true,
      data: comments.map((comment) => ({
        id: comment.id,
        authorName: comment.authorName,
        content: comment.content,
        createdAt: comment.createdAt,
      })),
    };
  } catch (error) {
    console.error("Error fetching comments:", error);
    return { success: false, error: "Failed to load comments" };
  }
}
