"use server";

import configPromise from "@payload-config";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { localizedPaths } from "@/lib/i18n/locale";

export type ModerationActionResult = {
	success: boolean;
	error?: string;
};

type CommentStatus = "approved" | "rejected";

const ALLOWED_STATUSES: CommentStatus[] = ["approved", "rejected"];

function isAllowedStatus(status: string): status is CommentStatus {
	return (ALLOWED_STATUSES as string[]).includes(status);
}

/** The slug of a comment's review, when the relationship still resolves. */
function reviewSlug(relatedReview: unknown): string | null {
	if (
		relatedReview !== null &&
		typeof relatedReview === "object" &&
		"slug" in relatedReview
	) {
		const { slug } = relatedReview as { slug?: unknown };

		return typeof slug === "string" && slug.length > 0 ? slug : null;
	}

	// A bare id means the review was deleted: there is no page to invalidate.
	return null;
}

/**
 * Sets a comment's moderation status. Admin-only: moderation decisions
 * must not be available to writers (who can only manage their own
 * reviews' content via collection access control).
 *
 * The public review page is ISR with a 60s window, so the status change is
 * invisible to readers until that window expires unless the page is
 * invalidated here (`FR-10`). An admin who approves a comment and watches it
 * stay hidden reads the feature as broken.
 */
export async function setCommentStatus(
	commentId: number | string,
	status: string,
): Promise<ModerationActionResult> {
	try {
		if (!isAllowedStatus(status)) {
			return { success: false, error: "Invalid status" };
		}

		const id = Number(commentId);
		if (!Number.isInteger(id)) {
			return { success: false, error: "Invalid comment id" };
		}

		const payload = await getPayload({ config: configPromise });
		const requestHeaders = await headers();
		const { user } = await payload.auth({ headers: requestHeaders });

		if (!user || user.collection !== "authors" || user.role !== "admin") {
			return { success: false, error: "Unauthorized" };
		}

		await payload.update({
			collection: "comments",
			id,
			data: { status },
		});

		// Depth 1 resolves `relatedReview` into the review itself, so its slug
		// arrives with the comment. The lookup is guarded rather than required:
		// the status change has already landed, and a comment whose review was
		// deleted has no page to invalidate. Failing the whole action over a
		// missing slug would report an error the admin cannot act on.
		const slug = await resolveReviewSlug(payload, id);

		if (slug) {
			for (const path of localizedPaths(`/reviews/${slug}`)) {
				revalidatePath(path);
			}
		}

		return { success: true };
	} catch (error) {
		console.error("Error setting comment status:", error);
		return { success: false, error: "Failed to update comment status" };
	}
}

/**
 * The slug of the review a comment belongs to, or `null` when it cannot be
 * resolved.
 *
 * Every failure here is swallowed on purpose. The status change has already
 * been written by the time this runs, so a comment whose review was deleted
 * - or a lookup that fails for any other reason - must not turn a completed
 * moderation into a reported error.
 */
async function resolveReviewSlug(
	payload: Awaited<ReturnType<typeof getPayload>>,
	commentId: number,
): Promise<string | null> {
	try {
		const comment = await payload.findByID({
			collection: "comments",
			id: commentId,
			depth: 1,
			disableErrors: true,
		});

		return reviewSlug(comment?.relatedReview);
	} catch (error) {
		console.error("Error resolving a comment's review:", error);
		return null;
	}
}
