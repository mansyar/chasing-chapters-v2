import type { Payload } from "payload";

export type ModerationComment = {
	id: number | string;
	authorName: string;
	content: string;
	status: string;
	createdAt: string;
	spamSignals?: { signal?: string | null; id?: string | null }[] | null;
};

export type ModerationSummary = {
	pendingCount: number;
	reportedCount: number;
	latest: ModerationComment[];
};

export const MODERATION_STATUSES = ["pending", "reported"] as const;

/**
 * Aggregates the comment-moderation queue for the admin dashboard:
 * pending/reported counts (counts only, no document loads) plus the
 * latest N queued comments fetched with a narrow `select` projection.
 */
export async function getModerationSummary(
	payload: Payload,
	latestLimit = 5,
): Promise<ModerationSummary> {
	const [pending, reported] = await Promise.all([
		payload.find({
			collection: "comments",
			where: { status: { equals: "pending" } },
			limit: 0,
		}),
		payload.find({
			collection: "comments",
			where: { status: { equals: "reported" } },
			limit: 0,
		}),
	]);

	const { docs } = await payload.find({
		collection: "comments",
		where: { status: { in: [...MODERATION_STATUSES] } },
		sort: "-createdAt",
		limit: latestLimit,
		select: {
			id: true,
			authorName: true,
			content: true,
			status: true,
			createdAt: true,
			spamSignals: true,
		},
	});

	return {
		pendingCount: pending.totalDocs,
		reportedCount: reported.totalDocs,
		latest: docs.map((doc) => ({
			id: doc.id,
			authorName: doc.authorName,
			content: doc.content,
			status: doc.status,
			createdAt: new Date(doc.createdAt).toISOString(),
			spamSignals: doc.spamSignals,
		})),
	};
}
