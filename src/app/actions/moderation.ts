"use server";

import configPromise from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";

export type ModerationActionResult = {
	success: boolean;
	error?: string;
};

type CommentStatus = "approved" | "rejected";

const ALLOWED_STATUSES: CommentStatus[] = ["approved", "rejected"];

/**
 * Sets a comment's moderation status. Admin-only: moderation decisions
 * must not be available to writers (who can only manage their own
 * reviews' content via collection access control).
 */
export async function setCommentStatus(
	commentId: number | string,
	status: string,
): Promise<ModerationActionResult> {
	try {
		if (!ALLOWED_STATUSES.includes(status as CommentStatus)) {
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
			data: { status: status as CommentStatus },
		});

		return { success: true };
	} catch (error) {
		console.error("Error setting comment status:", error);
		return { success: false, error: "Failed to update comment status" };
	}
}
