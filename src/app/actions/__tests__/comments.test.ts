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

		expect(rateLimitSpy).toHaveBeenNthCalledWith(
			1,
			"comments:203.0.113.5:1",
			120,
			60,
		);
		expect(rateLimitSpy).toHaveBeenNthCalledWith(
			2,
			"comments:203.0.113.5:2",
			120,
			60,
		);
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
