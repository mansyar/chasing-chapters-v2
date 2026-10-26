import type { Where } from "payload";

/**
 * The one rule that decides whether a review is public (`FR-5`, `NFR-4`).
 *
 * A review is public when it is published **and** its schedule has arrived:
 * `_status === "published"` and `publishAt` is unset or not in the future. The
 * rule is expressed twice, in the two shapes the call sites need:
 *
 * - {@link publishedAndVisibleWhere} for a read that lets the database decide,
 *   which is every public page, feed, sitemap and Open Graph handler.
 * - {@link isPubliclyVisible} for a document that is already in memory.
 *
 * Both shapes must stay in step: if one of them changes, the other changes
 * with it. Keeping them in one dependency-free module - no `payload` runtime
 * import, no `getPayload`, no I/O - is what makes that possible and testable.
 *
 * Two decisions are worth stating out loud:
 *
 * - **The boundary is inclusive.** A review whose `publishAt` equals `now` is
 *   visible. "Appears within one revalidation cycle" then needs no sleep on an
 *   exact millisecond: a review scheduled for the moment the page revalidates
 *   is already public.
 * - **An unparsable `publishAt` counts as unset, so the review is visible.**
 *   Payload's `date` field cannot store an invalid timestamp, so the only way
 *   to observe one is a corrupt row. Between hiding a published review and
 *   showing it, showing it is the lesser failure: the review is meant to be
 *   public, and only its schedule is unreadable.
 */

/** The fields the visibility rule reads off a review. */
export interface PublishVisibilityDoc {
	/** Payload's draft/published status field. */
	_status?: string | null;
	/** The schedule, as the ISO string Payload returns for a `date` field. */
	publishAt?: string | null;
}

/**
 * Builds the Payload `where` fragment that selects publicly visible reviews.
 *
 * The fragment is `_status = published AND (publishAt IS NULL OR publishAt <=
 * now)`, so it composes with any other constraint through `and`:
 *
 * ```ts
 * where: {
 *   and: [publishedAndVisibleWhere(now), { featured: { equals: true } }],
 * }
 * ```
 *
 * A review with no schedule has a `NULL` column, and the `exists: false` branch
 * is what selects those rows - a `less_than_equal` alone would compare against
 * `NULL` and match nothing, hiding every review that was never scheduled.
 */
export function publishedAndVisibleWhere(now: Date): Where {
	return {
		and: [
			{
				_status: {
					equals: "published",
				},
			},
			{
				or: [
					{
						publishAt: {
							exists: false,
						},
					},
					{
						publishAt: {
							less_than_equal: now.toISOString(),
						},
					},
				],
			},
		],
	};
}

/**
 * Decides whether an already-loaded review is public at `now`.
 *
 * The in-memory shape of {@link publishedAndVisibleWhere}: published, and
 * either unscheduled or scheduled for a moment that has arrived. An unparsable
 * `publishAt` is treated as unset, as the module comment explains.
 */
export function isPubliclyVisible(
	doc: PublishVisibilityDoc,
	now: Date,
): boolean {
	if (doc._status !== "published") {
		return false;
	}

	const publishAt = doc.publishAt;
	if (publishAt === undefined || publishAt === null) {
		return true;
	}

	const scheduledFor = Date.parse(publishAt);
	if (Number.isNaN(scheduledFor)) {
		return true;
	}

	return scheduledFor <= now.getTime();
}

/**
 * Decides whether a public write may target an already-loaded review (`FR-5`,
 * `FR-7`).
 *
 * "Public write" is every write a reader can make without a session, and all
 * three are gated here:
 *
 * - `submitComment` in `src/app/actions/comments.ts` - a reader's comment.
 * - `reportComment` in the same module - a report.
 * - `toggleLikeReview` in `src/app/actions/like-review.ts` - a like.
 *
 * A fourth public write belongs in this list and behind this call, not behind
 * a hand-rolled `_status` check: a like-shaped write that checked only
 * `_status` would still accept a review scheduled for next week, and the write
 * gate would drift from the read gate.
 *
 * The answer is {@link isPubliclyVisible}: the write path has to agree with the
 * read path. A reader who can see a review can write to it, and a reader who
 * cannot must get the same answer as for a review that does not exist, or a
 * scheduled review leaks its existence through a distinct reply.
 *
 * It lives in this module rather than beside the action because the action
 * module is `"use server"`, where every export must be an async server action.
 */
export function canAcceptPublicWrite(
	doc: PublishVisibilityDoc,
	now: Date,
): boolean {
	return isPubliclyVisible(doc, now);
}
