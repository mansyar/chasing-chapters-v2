"use server";

import configPromise from "@payload-config";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { resolveCommentStatus } from "@/lib/comment-moderation";
import { localizedPaths } from "@/lib/i18n/locale";
import { canAcceptPublicWrite } from "@/lib/publish-visibility";
import { getClientIP, rateLimit } from "@/lib/rate-limit";
import {
	commentSchema,
	formatZodError,
	reportCommentSchema,
} from "@/lib/schemas";
import { hashEmail } from "@/lib/utils";

// Types for action responses
type ActionResult<T = void> =
	| { success: true; data?: T; message?: string }
	| { success: false; error: string };

/** Reports at or above this count hide the comment pending moderation. */
const REPORT_THRESHOLD = 3;

/** Shown for a first report and for a repeat from the same address (`P5.T1.4`). */
const REPORT_THANKS_MESSAGE =
	"Thank you for your report. We will review this comment.";

/**
 * Ceiling on the rows `getApprovedComments` returns in one call (`FR-8`).
 *
 * This is not a page size. `CommentList` renders `comments.map(...)` over
 * everything it is given - there is no pagination, no "load more" and no
 * slice - so the UI has no page size for this number to match. What the
 * constant is, honestly, is a defensive ceiling on a single anonymous
 * request: without it one call could ask the database for every approved
 * comment ever left on a review.
 *
 * The value stays at the 100 the query already used. Lowering it would
 * silently truncate a busy review's comment list with no affordance to reach
 * the rest, which `NFR-3` forbids; the defect `FR-8` names is the missing
 * validation and rate limit, and both are added here. Adding pagination to
 * `CommentList` is the change that would make a smaller number correct.
 */
const MAX_COMMENTS_PER_REVIEW = 100;

/**
 * Requests `getApprovedComments` allows per IP per review per window (`FR-8`,
 * `AC-13`).
 *
 * The key includes the review id, the same shape the like action uses
 * (`like:${ip}:${reviewId}`). Keying on the address alone made the bucket
 * shared by every reader behind one NAT, proxy or busy egress, so ordinary
 * traffic on a popular review could exhaust it and leave those readers looking
 * at "no comments yet".
 *
 * A reader loads a review's comments on mount and again after posting, so the
 * ceiling only has to clear 2 per page view. 120 leaves room for 60 views of
 * the same review per minute from one address - a refresh storm, several open
 * tabs - while still bounding what a single review id can be asked for. The
 * cost of setting it too low is a reader seeing an empty section, so it is
 * deliberately generous; `MAX_COMMENTS_PER_REVIEW` is what bounds the rows one
 * call returns.
 */
const COMMENT_FETCH_LIMIT = 120;
const COMMENT_FETCH_WINDOW_SECONDS = 60;

/**
 * Submit a new comment on a review
 */
export async function submitComment(
	formData: unknown,
): Promise<ActionResult<{ status: string }>> {
	try {
		// Validate input with Zod
		const parseResult = commentSchema.safeParse(formData);
		if (!parseResult.success) {
			return { success: false, error: formatZodError(parseResult.error) };
		}
		const { name, email, content, reviewId } = parseResult.data;

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

		// Verify review exists and is published
		const targetReview = await payload.findByID({
			collection: "reviews",
			id: reviewId,
			depth: 0,
		});

		if (!targetReview) {
			return { success: false, error: "Review not found" };
		}

		// A comment is a public write, so it is gated by the same visibility
		// rule every public read uses (`FR-5`, `NFR-4`). A review that is
		// scheduled for later answers exactly like a missing one: a distinct
		// reply would tell a reader the review exists.
		if (!canAcceptPublicWrite(targetReview, new Date())) {
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

			// The commenter row's `name` is deliberately left alone (`FR-6`).
			// It is keyed by an email hash, so anyone who knows or guesses a
			// commenter's address could reach this branch and rewrite the name
			// that commenter is shown under. Nothing is lost by not writing it:
			// `Comments.authorName` stores the submitted name per comment
			// (`P5.T2.2`), and that is the field the UI renders.
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

		// Determine initial status via the shared moderation policy
		// (trust-aware; banned commenters were rejected above, so this
		// resolves to approved or pending)
		const decision = resolveCommentStatus({
			content,
			banned: commenter.banned === true,
			trusted: commenter.trusted === true,
		});
		const status = decision.status;

		// Create the comment
		await payload.create({
			collection: "comments",
			data: {
				authorName: name.trim(),
				content: content.trim(),
				relatedReview: reviewId,
				commenter: commenter.id,
				status: status,
				spamSignals: decision.spamSignals.map((signal) => ({ signal })),
				reportCount: 0,
			},
		});

		// Revalidate the review page to show new comment (if approved)
		const review = await payload.findByID({
			collection: "reviews",
			id: reviewId,
		});
		if (review?.slug) {
			for (const path of localizedPaths(`/reviews/${review.slug}`)) {
				revalidatePath(path);
			}
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
 * Report a comment as inappropriate.
 *
 * The report is a public, unauthenticated write, so it validates its own
 * subject rather than trusting the id it is handed: the comment must exist, be
 * `approved`, and belong to a review that is publicly visible right now
 * (`FR-5`). A comment that fails any of those answers exactly like a missing
 * one, because a distinct reply would let a caller probe for comments on
 * drafts and scheduled reviews.
 *
 * The write is built field by field from what the server just read. Nothing
 * from the request is spread into it, so `content`, `authorName`,
 * `relatedReview` and `commenter` are unreachable by construction, and
 * `status` can only ever carry `reported` - never `approved` (`AC-9`). Access
 * is left at Payload's Local API default (`overrideAccess: true`) on purpose:
 * `Comments.access.update` denies callers with no user, and a reporter is
 * anonymous, so asking the rule here would deny every report.
 */
export async function reportComment(
	commentId: number,
	reporterEmail: string,
): Promise<ActionResult> {
	try {
		// Validate input with Zod
		const parseResult = reportCommentSchema.safeParse({
			commentId,
			reporterEmail,
		});
		if (!parseResult.success) {
			return { success: false, error: formatZodError(parseResult.error) };
		}

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

		// `disableErrors` turns a missing comment into `null` instead of a
		// thrown NotFound, so the action can answer it the same way as a
		// comment it refuses to touch.
		const comment = await payload.findByID({
			collection: "comments",
			id: commentId,
			depth: 0,
			disableErrors: true,
		});

		if (!comment) {
			return { success: false, error: "Comment not found" };
		}

		// Idempotency is decided before the status and visibility gates, so a
		// second click from the same address is a success rather than an error
		// even once three earlier reports have moved the comment to `reported`.
		// This path writes nothing: `reportCount` does not move and
		// `reportedBy` gains no duplicate entry (`P5.T1.4`).
		const normalisedEmail = reporterEmail.toLowerCase();
		const alreadyReported = comment.reportedBy?.some(
			(report) => report.email?.toLowerCase() === normalisedEmail,
		);

		if (alreadyReported) {
			return { success: true, message: REPORT_THANKS_MESSAGE };
		}

		// Only an approved comment is reportable. A pending, rejected or
		// already-reported one is not public, so it answers like a missing id.
		if (comment.status !== "approved") {
			return { success: false, error: "Comment not found" };
		}

		// `depth: 0` above leaves the relationship as a bare id.
		const reviewId =
			typeof comment.relatedReview === "number"
				? comment.relatedReview
				: comment.relatedReview.id;

		const review = await payload.findByID({
			collection: "reviews",
			id: reviewId,
			depth: 0,
			disableErrors: true,
		});

		// The same predicate `submitComment` and `toggleLikeReview` use: a write
		// a reader can make must agree with what a reader can see, so a review
		// that is not public is not reportable.
		if (!review || !canAcceptPublicWrite(review, new Date())) {
			return { success: false, error: "Comment not found" };
		}

		const newReportCount = (comment.reportCount ?? 0) + 1;
		const reportedBy = [
			...(comment.reportedBy ?? []),
			{ email: normalisedEmail, reportedAt: new Date().toISOString() },
		];

		// Exactly the fields a report owns. `status` is absent until this report
		// is the one that hides the comment, and the only value it can take is
		// `reported`.
		const report: {
			reportCount: number;
			reportedBy: typeof reportedBy;
			status?: "reported";
		} = {
			reportCount: newReportCount,
			reportedBy,
		};

		if (newReportCount >= REPORT_THRESHOLD) {
			report.status = "reported";
		}

		await payload.update({
			collection: "comments",
			id: commentId,
			data: report,
		});

		// Revalidation is defence in depth (`FR-11`). The comment list itself is
		// client-fetched - `CommentSection` is a client component that calls
		// `getApprovedComments` on mount - so the public review page carries no
		// comment markup and this is not what makes a hidden comment disappear.
		// It is kept because FR-11 requires it and because any surface that does
		// render comments server-side, now or later, must not serve a cached
		// copy of a comment the public read no longer returns.
		//
		// Gated on the status actually moving to `reported`: below the threshold
		// the write changes only `reportCount` and `reportedBy`, neither of
		// which is in any public output, so regenerating the page would be work
		// with nothing to show for it.
		if (report.status === "reported" && review.slug) {
			for (const path of localizedPaths(`/reviews/${review.slug}`)) {
				revalidatePath(path);
			}
		}

		return { success: true, message: REPORT_THANKS_MESSAGE };
	} catch (error) {
		console.error("Error reporting comment:", error);
		return {
			success: false,
			error: "An error occurred while reporting. Please try again.",
		};
	}
}

/**
 * Get approved comments for a review.
 *
 * A server action is a public HTTP endpoint, so the id is validated before it
 * reaches a query and the call is rate-limited per IP per review (`FR-8`,
 * `AC-13`). `reviewId` used to be trusted: `NaN`, `0` and a negative number all
 * ran a query, and nothing bounded how often one address could ask.
 */
export async function getApprovedComments(reviewId: number) {
	try {
		if (!Number.isInteger(reviewId) || reviewId <= 0) {
			return { success: false, error: "Invalid review ID" };
		}

		const headersList = await headers();
		const ip = getClientIP(headersList);
		const rateLimitResult = await rateLimit(
			`comments:${ip}:${reviewId}`,
			COMMENT_FETCH_LIMIT,
			COMMENT_FETCH_WINDOW_SECONDS,
		);

		if (!rateLimitResult.success) {
			return {
				success: false,
				error: `Too many requests. Please wait ${rateLimitResult.resetInSeconds} seconds.`,
			};
		}

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
			limit: MAX_COMMENTS_PER_REVIEW,
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
