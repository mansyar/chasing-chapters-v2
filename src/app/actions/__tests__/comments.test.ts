import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import * as rateLimitModule from "@/lib/rate-limit";

type PayloadMock = {
	findByID: ReturnType<typeof mock>;
	find: ReturnType<typeof mock>;
	create: ReturnType<typeof mock>;
	update: ReturnType<typeof mock>;
};

let mockPayload: PayloadMock;
let rateLimitResult = { success: true, remaining: 2, resetInSeconds: 60 };
let rateLimitSpy: ReturnType<typeof spyOn>;

// Held here rather than inline in `mock.module` so assertions can read the
// calls; `next/cache` is replaced per test file, so the instance has to be one
// the test owns.
const revalidatePath = mock(() => {});

let submitComment: typeof import("../comments").submitComment;
let reportComment: typeof import("../comments").reportComment;
let getApprovedComments: typeof import("../comments").getApprovedComments;

const cleanInput = {
	name: "Jane Reader",
	email: "jane@example.com",
	content: "I really loved this book review!",
	reviewId: 1,
};

const existingCommenter = {
	id: 7,
	name: "Jane Reader",
	emailHash: "abc123",
	approvedCommentCount: 0,
	trusted: false,
	banned: false,
};

const publishedReview = { id: 1, slug: "test-review", _status: "published" };

/** A comment a reader could report: approved, on a published review. */
const approvedComment = {
	id: 11,
	authorName: "Jane Reader",
	content: "Original comment text",
	relatedReview: 1,
	commenter: 7,
	status: "approved",
	reportCount: 0,
	reportedBy: [] as { email: string; reportedAt: string }[],
};

/**
 * Route `findByID` per collection. `reportComment` reads the comment and then
 * its review, so the default wiring (reviews only) cannot serve it.
 */
function routeFindByID(options: { comment?: unknown; review?: unknown }): void {
	mockPayload.findByID.mockImplementation(
		async (args: { collection: string }) => {
			if (args.collection === "comments") {
				return options.comment ?? null;
			}
			if (args.collection === "reviews") {
				return options.review ?? null;
			}
			throw new Error("unexpected findByID collection");
		},
	);
}

beforeEach(async () => {
	mockPayload = {
		findByID: mock(),
		find: mock(),
		create: mock(),
		update: mock(),
	};

	mock.module("payload", () => ({
		getPayload: mock(async () => mockPayload),
	}));
	mock.module("@payload-config", () => ({ default: {} }));
	mock.module("next/headers", () => ({
		headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
	}));
	mock.module("next/cache", () => ({ revalidatePath }));

	revalidatePath.mockClear();
	rateLimitResult = { success: true, remaining: 2, resetInSeconds: 60 };

	rateLimitSpy = spyOn(rateLimitModule, "rateLimit").mockImplementation(
		async () => rateLimitResult,
	);

	// Default happy-path wiring
	mockPayload.findByID.mockImplementation(
		async (args: { collection: string; id: number }) => {
			if (args.collection === "reviews") {
				return { id: 1, slug: "test-review", _status: "published" };
			}
			throw new Error("unexpected findByID collection");
		},
	);
	mockPayload.find.mockResolvedValue({ docs: [existingCommenter] });
	mockPayload.create.mockResolvedValue({ id: 99 });
	mockPayload.update.mockResolvedValue({ id: 7 });

	if (!submitComment) {
		({ submitComment, reportComment, getApprovedComments } = await import(
			"../comments"
		));
	}
});

afterEach(() => {
	rateLimitSpy?.mockRestore();
});

describe("submitComment", () => {
	it("auto-approves a clean comment from a non-trusted commenter", async () => {
		const result = await submitComment(cleanInput);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toBe("Your comment has been posted!");
		}
		expect(mockPayload.create).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				data: expect.objectContaining({ status: "approved" }),
			}),
		);
	});

	it("holds flagged content from a non-trusted commenter as pending", async () => {
		const result = await submitComment({
			...cleanInput,
			content: "Buy viagra at https://spam.com",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toContain("pending moderation");
		}
		expect(mockPayload.create).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				data: expect.objectContaining({
					status: "pending",
					spamSignals: expect.arrayContaining([
						expect.objectContaining({ signal: expect.stringContaining("URL") }),
					]),
				}),
			}),
		);
	});

	it("auto-approves flagged content from a trusted commenter (trust bypass)", async () => {
		mockPayload.find.mockResolvedValue({
			docs: [{ ...existingCommenter, trusted: true }],
		});

		const result = await submitComment({
			...cleanInput,
			content: "Check https://example.com for my reading blog",
		});

		expect(result.success).toBe(true);
		expect(mockPayload.create).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				data: expect.objectContaining({ status: "approved" }),
			}),
		);
	});

	it("rejects a banned commenter without creating a comment", async () => {
		mockPayload.find.mockResolvedValue({
			docs: [{ ...existingCommenter, banned: true }],
		});

		const result = await submitComment(cleanInput);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("You are not allowed to comment.");
		}
		const commentCreates = mockPayload.create.mock.calls.filter(
			(call) => (call[0] as { collection: string }).collection === "comments",
		);
		expect(commentCreates).toHaveLength(0);
	});

	it("returns an error when rate limited", async () => {
		rateLimitResult = { success: false, remaining: 0, resetInSeconds: 30 };

		const result = await submitComment(cleanInput);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Too many comments");
		}
	});
});

describe("submitComment guest identity", () => {
	it("leaves an existing commenter's name untouched and shows the submitted name on the comment", async () => {
		// The same email hash reaches an existing row, but the submitted name
		// differs. `FR-6`: the row is not rewritten, and `AC-11`: the comment
		// still displays what this reader typed.
		mockPayload.find.mockResolvedValue({ docs: [existingCommenter] });

		const result = await submitComment({
			...cleanInput,
			name: "Someone Else",
		});

		expect(result.success).toBe(true);

		const commenterUpdates = mockPayload.update.mock.calls.filter(
			(call) => (call[0] as { collection: string }).collection === "commenters",
		);
		expect(commenterUpdates).toHaveLength(0);

		expect(mockPayload.create).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				data: expect.objectContaining({
					authorName: "Someone Else",
					commenter: existingCommenter.id,
				}),
			}),
		);
	});

	it("completes a guest submission end to end while create is closed on both collections", async () => {
		// `AC-4`. `Comments.create` and `Commenters.create` now deny anonymous
		// callers. The action keeps working because it writes through the Local
		// API, where `overrideAccess` defaults to true and neither rule is
		// consulted - so the thing to pin is that the action never passes a
		// `user` and never asks for access to be enforced.
		mockPayload.find.mockResolvedValue({ docs: [] });
		mockPayload.create
			.mockResolvedValueOnce({ id: 42 })
			.mockResolvedValueOnce({ id: 99 });

		const result = await submitComment(cleanInput);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toBe("Your comment has been posted!");
		}

		expect(mockPayload.create).toHaveBeenCalledTimes(2);

		const [commenterCreate, commentCreate] = mockPayload.create.mock.calls.map(
			(call) => call[0] as { collection: string; data: unknown },
		);

		expect(commenterCreate.collection).toBe("commenters");
		expect(commentCreate.collection).toBe("comments");
		// The moderation flags are written explicitly, and they survive the
		// field-level `create` rules added for `F1` because this call is the
		// Local API, where `overrideAccess` defaults to true. A rule that did
		// apply here would strip both keys instead of storing `false`.
		expect(commenterCreate.data).toEqual(
			expect.objectContaining({ trusted: false, banned: false }),
		);
		expect(commentCreate.data).toEqual(
			expect.objectContaining({
				authorName: "Jane Reader",
				relatedReview: 1,
				commenter: 42,
				status: "approved",
				reportCount: 0,
			}),
		);

		for (const call of [commenterCreate, commentCreate]) {
			expect(call).not.toHaveProperty("overrideAccess");
			expect(call).not.toHaveProperty("user");
			expect(call).not.toHaveProperty("req");
		}
	});
});

describe("reportComment", () => {
	it("hides a comment once the third report lands and revalidates its review", async () => {
		routeFindByID({
			comment: {
				...approvedComment,
				reportCount: 2,
				reportedBy: [
					{
						email: "first@example.com",
						reportedAt: "2026-10-01T00:00:00.000Z",
					},
					{
						email: "second@example.com",
						reportedAt: "2026-10-02T00:00:00.000Z",
					},
				],
			},
			review: publishedReview,
		});

		const result = await reportComment(approvedComment.id, "third@example.com");

		expect(result.success).toBe(true);
		expect(mockPayload.update).toHaveBeenCalledTimes(1);

		const updateArgs = mockPayload.update.mock.calls[0][0] as {
			collection: string;
			id: number;
			data: Record<string, unknown>;
		};

		expect(updateArgs.collection).toBe("comments");
		expect(updateArgs.id).toBe(approvedComment.id);
		expect(updateArgs.data.reportCount).toBe(3);
		expect(updateArgs.data.status).toBe("reported");
		expect(updateArgs.data.reportedBy).toEqual([
			{ email: "first@example.com", reportedAt: "2026-10-01T00:00:00.000Z" },
			{ email: "second@example.com", reportedAt: "2026-10-02T00:00:00.000Z" },
			expect.objectContaining({ email: "third@example.com" }),
		]);

		expect(revalidatePath).toHaveBeenCalledWith("/en/reviews/test-review");
		expect(revalidatePath).toHaveBeenCalledWith("/id/reviews/test-review");
		expect(revalidatePath).toHaveBeenCalledTimes(2);
	});

	it("counts a report without touching status below the threshold", async () => {
		routeFindByID({ comment: approvedComment, review: publishedReview });

		const result = await reportComment(approvedComment.id, "first@example.com");

		expect(result.success).toBe(true);

		const data = (
			mockPayload.update.mock.calls[0][0] as {
				data: Record<string, unknown>;
			}
		).data;

		expect(data.reportCount).toBe(1);
		expect(data).not.toHaveProperty("status");
	});

	it("does not regenerate the review page below the report threshold", async () => {
		// `F3`. Only the third report changes any public output: the first and
		// the second touch `reportCount` and `reportedBy`, neither of which is
		// rendered anywhere, so regenerating the page would be work with
		// nothing to show for it. The revalidation is kept for the report that
		// does move the status to `reported` - the case above asserts that.
		routeFindByID({ comment: approvedComment, review: publishedReview });

		await reportComment(approvedComment.id, "first@example.com");

		expect(mockPayload.update).toHaveBeenCalledTimes(1);
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("writes only the fields a report owns and can never approve a comment", async () => {
		// `AC-9`. The payload is built from what the server read, so the three
		// fields a report must not reach are absent by construction rather than
		// by filtering, and `status` can only ever carry `reported`.
		routeFindByID({
			comment: { ...approvedComment, reportCount: 2 },
			review: publishedReview,
		});

		await reportComment(approvedComment.id, "third@example.com");

		const data = (
			mockPayload.update.mock.calls[0][0] as {
				data: Record<string, unknown>;
			}
		).data;

		expect(Object.keys(data).sort()).toEqual([
			"reportCount",
			"reportedBy",
			"status",
		]);
		expect(data).not.toHaveProperty("content");
		expect(data).not.toHaveProperty("relatedReview");
		expect(data).not.toHaveProperty("authorName");
		expect(data).not.toHaveProperty("commenter");
		expect(data.status).not.toBe("approved");
		expect(data.status).toBe("reported");
	});

	it("leaves access control at the Local API default so an anonymous report can land", async () => {
		routeFindByID({ comment: approvedComment, review: publishedReview });

		await reportComment(approvedComment.id, "first@example.com");

		const updateArgs = mockPayload.update.mock.calls[0][0] as Record<
			string,
			unknown
		>;

		// `Comments.access.update` denies a caller with no user. Asking for it
		// to be enforced here would deny every report, so the write stays on the
		// trusted path and is scoped by its payload instead.
		expect(updateArgs).not.toHaveProperty("overrideAccess");
		expect(updateArgs).not.toHaveProperty("user");
	});

	it("treats a repeat report from the same address as a success that writes nothing", async () => {
		routeFindByID({
			comment: {
				...approvedComment,
				reportCount: 1,
				reportedBy: [
					{
						email: "first@example.com",
						reportedAt: "2026-10-01T00:00:00.000Z",
					},
				],
			},
			review: publishedReview,
		});

		// Different case, same address: the comparison is on the normalised form.
		const result = await reportComment(approvedComment.id, "First@Example.com");

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.message).toBe(
				"Thank you for your report. We will review this comment.",
			);
		}
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("stays idempotent after the comment has already been reported", async () => {
		// The comment is no longer `approved`, so a status gate running first
		// would turn a double-click into "Comment not found".
		routeFindByID({
			comment: {
				...approvedComment,
				status: "reported",
				reportCount: 3,
				reportedBy: [
					{
						email: "first@example.com",
						reportedAt: "2026-10-01T00:00:00.000Z",
					},
				],
			},
			review: publishedReview,
		});

		const result = await reportComment(approvedComment.id, "first@example.com");

		expect(result.success).toBe(true);
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("rejects a comment that is not approved", async () => {
		for (const status of ["pending", "rejected", "reported"] as const) {
			mockPayload.update.mockClear();

			routeFindByID({
				comment: { ...approvedComment, status },
				review: publishedReview,
			});

			const result = await reportComment(
				approvedComment.id,
				"first@example.com",
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("Comment not found");
			}
			expect(mockPayload.update).not.toHaveBeenCalled();
		}
	});

	it("rejects a comment on a review that is not publicly visible", async () => {
		for (const review of [
			{ ...publishedReview, _status: "draft" },
			{
				...publishedReview,
				_status: "published",
				publishAt: "2099-01-01T00:00:00.000Z",
			},
		]) {
			mockPayload.update.mockClear();

			routeFindByID({ comment: approvedComment, review });

			const result = await reportComment(
				approvedComment.id,
				"first@example.com",
			);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("Comment not found");
			}
			expect(mockPayload.update).not.toHaveBeenCalled();
		}
	});

	it("rejects a comment that no longer exists", async () => {
		routeFindByID({ comment: null, review: publishedReview });

		const result = await reportComment(999, "first@example.com");

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe("Comment not found");
		}
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("resolves the review id from an unpopulated relationship", async () => {
		routeFindByID({
			// A third report, so the status moves and the revalidation runs -
			// the slug has to be resolved from the bare relationship for the
			// page to be invalidated at all.
			comment: {
				...approvedComment,
				relatedReview: { id: 5, slug: "other" },
				reportCount: 2,
			},
			review: { id: 5, slug: "other-review", _status: "published" },
		});

		const result = await reportComment(approvedComment.id, "third@example.com");

		expect(result.success).toBe(true);
		expect(mockPayload.findByID).toHaveBeenCalledWith(
			expect.objectContaining({ collection: "reviews", id: 5 }),
		);
		expect(revalidatePath).toHaveBeenCalledWith("/en/reviews/other-review");
	});
});

describe("getApprovedComments", () => {
	it("rejects a review id that is not a positive integer", async () => {
		for (const reviewId of [
			Number.NaN,
			0,
			-1,
			1.5,
			Number.POSITIVE_INFINITY,
			undefined,
			null,
			"1",
		]) {
			const result = await getApprovedComments(reviewId as number);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe("Invalid review ID");
			}
		}

		// Rejected before either the rate limiter or the database is touched.
		expect(mockPayload.find).not.toHaveBeenCalled();
		expect(rateLimitSpy).not.toHaveBeenCalled();
	});

	it("enforces a per-IP rate limit before reading", async () => {
		rateLimitResult = { success: false, remaining: 0, resetInSeconds: 45 };

		const result = await getApprovedComments(1);

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toContain("Too many requests");
			expect(result.error).toContain("45 seconds");
		}
		expect(mockPayload.find).not.toHaveBeenCalled();
	});

	it("keys the rate limit on the client address and the review", async () => {
		mockPayload.find.mockResolvedValue({ docs: [] });

		await getApprovedComments(1);

		// Keying on the address alone made the bucket shared by every reader
		// behind one NAT or proxy, so ordinary traffic on a popular review
		// could exhaust it and leave those readers with an empty section. The
		// review id is part of the key, as it already is on the like action
		// (`like:${ip}:${reviewId}`).
		expect(rateLimitSpy).toHaveBeenCalledWith(
			"comments:203.0.113.5:1",
			120,
			60,
		);
	});

	it("gives each review its own bucket from the same address", async () => {
		mockPayload.find.mockResolvedValue({ docs: [] });

		await getApprovedComments(1);
		await getApprovedComments(2);

		// Asserted by key rather than by call position: both buckets are
		// checked on every call that gets past the first one, so the
		// per-review keys are not calls 1 and 2. The property under test is
		// unchanged - two reviews from one address get two distinct buckets.
		expect(rateLimitSpy).toHaveBeenCalledWith(
			"comments:203.0.113.5:1",
			120,
			60,
		);
		expect(rateLimitSpy).toHaveBeenCalledWith(
			"comments:203.0.113.5:2",
			120,
			60,
		);
	});

	it("caps one address across many review ids, not only per review", async () => {
		// `D1`. Keying on the address *and* the review bounds a burst on one
		// page but leaves breadth open: without an aggregate bucket an address
		// can ask for 120 different review ids a minute and never trip
		// anything. This drives a sweep through a limiter that counts per key
		// and applies the ceiling the action asked for, so the limit that
		// fires is the production one rather than a number copied here.
		mockPayload.find.mockResolvedValue({ docs: [] });

		const AGGREGATE_KEY = "comments:203.0.113.5";
		const counts = new Map<string, number>();
		const limits = new Map<string, number>();

		rateLimitSpy.mockImplementation(async (key: string, limit: number) => {
			limits.set(key === AGGREGATE_KEY ? "aggregate" : "per-review", limit);
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return {
				success: next <= limit,
				remaining: Math.max(0, limit - next),
				resetInSeconds: 60,
			};
		});

		// One call to learn the ceilings the action asked for.
		await getApprovedComments(1);
		const aggregateLimit = limits.get("aggregate") ?? 0;
		const perReviewLimit = limits.get("per-review") ?? 0;

		// The aggregate is ten times the per-review ceiling, so ordinary
		// browsing on one review cannot reach it.
		expect(aggregateLimit).toBe(perReviewLimit * 10);

		// Fill the aggregate with calls that each name a different review id.
		// Every one of them lands in its own per-review bucket, so no single
		// review's ceiling is anywhere near its limit.
		for (let reviewId = 2; reviewId <= aggregateLimit; reviewId += 1) {
			const result = await getApprovedComments(reviewId);
			expect(result.success).toBe(true);
		}

		const overTheLine = await getApprovedComments(aggregateLimit + 1);

		expect(overTheLine.success).toBe(false);
		if (!overTheLine.success) {
			expect(overTheLine.error).toContain("Too many requests");
		}

		// The aggregate key is what refused it: the call past the line reached
		// its own per-review bucket, which would have allowed it, and was
		// stopped by the address-wide one. That is the difference `D1` is
		// about - the sweep is capped by breadth, not by having exhausted any
		// single review.
		expect(counts.get(AGGREGATE_KEY)).toBe(aggregateLimit + 1);
		expect(counts.get(`${AGGREGATE_KEY}:${aggregateLimit + 1}`)).toBe(1);
		expect(mockPayload.find).toHaveBeenCalledTimes(aggregateLimit);
	});

	it("does not spend the address-wide budget on a call the per-review bucket refuses", async () => {
		// `F1`. `rateLimit` increments its counter and only then compares it
		// against the limit, so a call it refuses still spends the counter of
		// whichever bucket was checked first. With the aggregate checked first,
		// a client hammering one review spent the address-wide budget on its
		// own and was then refused comment reads on *every* review - the
		// shared-bucket harm the per-review key exists to remove, reintroduced
		// through the increment-before-compare behaviour. The per-review
		// bucket is checked first so that its refusals never reach the
		// aggregate key.
		mockPayload.find.mockResolvedValue({ docs: [] });

		const AGGREGATE_KEY = "comments:203.0.113.5";
		const PER_REVIEW_KEY = `${AGGREGATE_KEY}:1`;
		const counts = new Map<string, number>();

		// The same shape as the real limiter: the counter advances, then the
		// result is compared against the limit.
		rateLimitSpy.mockImplementation(async (key: string, limit: number) => {
			const next = (counts.get(key) ?? 0) + 1;
			counts.set(key, next);
			return {
				success: next <= limit,
				remaining: Math.max(0, limit - next),
				resetInSeconds: 60,
			};
		});

		// Fill the per-review bucket with calls the aggregate allows, so the
		// per-review ceiling is the only one that can refuse.
		for (let attempt = 0; attempt < 121; attempt += 1) {
			const result = await getApprovedComments(1);
			expect(result.success).toBe(attempt < 120);
		}

		// The 121st call was refused by the per-review bucket, and the
		// aggregate counter still shows only the 120 calls that bucket
		// allowed: the refusal did not spend the address-wide budget.
		expect(counts.get(PER_REVIEW_KEY)).toBe(121);
		expect(counts.get(AGGREGATE_KEY)).toBe(120);

		// Which is the property that matters: another review is still
		// readable from the same address.
		const other = await getApprovedComments(2);
		expect(other.success).toBe(true);
		expect(counts.get(AGGREGATE_KEY)).toBe(121);
	});

	it("checks the per-review bucket before the aggregate one", async () => {
		// Ordering matters, because `rateLimit` increments before it compares:
		// the bucket checked first spends its counter on a call it is about to
		// refuse. The aggregate is the address-wide budget every review shares,
		// so it must not be spent by a call the per-review bucket refuses.
		mockPayload.find.mockResolvedValue({ docs: [] });
		rateLimitSpy.mockImplementation(async (key: string) => ({
			success: key !== "comments:203.0.113.5:7",
			remaining: 0,
			resetInSeconds: 30,
		}));

		const result = await getApprovedComments(7);

		expect(result.success).toBe(false);
		expect(rateLimitSpy).toHaveBeenCalledTimes(1);
		expect(rateLimitSpy).toHaveBeenCalledWith(
			"comments:203.0.113.5:7",
			120,
			60,
		);
		expect(mockPayload.find).not.toHaveBeenCalled();
	});

	it("returns approved comments under a bounded ceiling", async () => {
		mockPayload.find.mockResolvedValue({
			docs: [
				{
					id: 11,
					authorName: "Jane Reader",
					content: "Loved it",
					createdAt: "2026-10-20T00:00:00.000Z",
				},
			],
		});

		const result = await getApprovedComments(1);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual([
				{
					id: 11,
					authorName: "Jane Reader",
					content: "Loved it",
					createdAt: "2026-10-20T00:00:00.000Z",
				},
			]);
		}

		expect(mockPayload.find).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				where: {
					relatedReview: { equals: 1 },
					status: { equals: "approved" },
				},
				limit: 100,
			}),
		);
	});
});
