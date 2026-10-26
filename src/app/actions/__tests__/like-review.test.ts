import { beforeEach, describe, expect, it, mock } from "bun:test";

type PayloadMock = {
	findByID: ReturnType<typeof mock>;
};

/**
 * The counter is the thing a like writes, so it is the thing the tests assert
 * on: a rejected like must not reach `atomicIncrement` at all. Mocking the two
 * functions rather than the database is what makes that observable.
 */
const atomicIncrement = mock();
const atomicDecrement = mock();
const revalidatePath = mock(() => {});

let mockPayload: PayloadMock;
let incrementResult: number | null = 6;
let decrementResult: number | null = 5;
let rateLimitResult = { success: true, remaining: 4, resetInSeconds: 60 };

let toggleLikeReview: typeof import("../like-review").toggleLikeReview;

const publishedReview = {
	id: 1,
	slug: "dune",
	_status: "published",
	publishAt: null,
};

beforeEach(async () => {
	incrementResult = 6;
	decrementResult = 5;
	rateLimitResult = { success: true, remaining: 4, resetInSeconds: 60 };

	mockPayload = {
		findByID: mock(async () => publishedReview),
	};

	atomicIncrement.mockReset();
	atomicIncrement.mockImplementation(async () => incrementResult);
	atomicDecrement.mockReset();
	atomicDecrement.mockImplementation(async () => decrementResult);
	revalidatePath.mockClear();

	mock.module("payload", () => ({
		getPayload: mock(async () => mockPayload),
	}));
	mock.module("@payload-config", () => ({ default: {} }));
	mock.module("next/headers", () => ({
		headers: async () => new Headers({ "x-forwarded-for": "203.0.113.5" }),
	}));
	mock.module("next/cache", () => ({ revalidatePath }));
	mock.module("@/lib/db", () => ({ atomicIncrement, atomicDecrement }));
	mock.module("@/lib/rate-limit", () => ({
		getClientIP: () => "203.0.113.5",
		rateLimit: async () => rateLimitResult,
	}));

	if (!toggleLikeReview) {
		({ toggleLikeReview } = await import("../like-review"));
	}
});

describe("toggleLikeReview visibility", () => {
	it("counts a like on a published review and revalidates its paths", async () => {
		const result = await toggleLikeReview("1", true);

		expect(result.success).toBe(true);
		expect(result.newLikes).toBe(6);
		expect(atomicIncrement).toHaveBeenCalledWith(1, "likes");
		expect(atomicDecrement).not.toHaveBeenCalled();
		expect(revalidatePath).toHaveBeenCalledWith("/en/reviews/dune");
		expect(revalidatePath).toHaveBeenCalledWith("/id/reviews/dune");
	});

	it("rejects a draft review without touching the counter", async () => {
		mockPayload.findByID.mockResolvedValue({
			id: 1,
			slug: "dune",
			_status: "draft",
			publishAt: null,
		});

		const result = await toggleLikeReview("1", true);

		// The counter assertion comes first on purpose: on the pre-fix code
		// this is where the failure lands, and the message then shows the
		// counter being written for a review nobody can see.
		expect(atomicIncrement).not.toHaveBeenCalled();
		expect(atomicDecrement).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(result.error).toBe("Review not found");
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("rejects a review scheduled for later without touching the counter", async () => {
		mockPayload.findByID.mockResolvedValue({
			id: 1,
			slug: "dune",
			_status: "published",
			publishAt: new Date(Date.now() + 60_000).toISOString(),
		});

		const result = await toggleLikeReview("1", true);

		expect(atomicIncrement).not.toHaveBeenCalled();
		expect(atomicDecrement).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
		expect(result.error).toBe("Review not found");
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("rejects an unlike on a non-public review too", async () => {
		mockPayload.findByID.mockResolvedValue({
			id: 1,
			slug: "dune",
			_status: "draft",
			publishAt: null,
		});

		const result = await toggleLikeReview("1", false);

		expect(atomicDecrement).not.toHaveBeenCalled();
		expect(atomicIncrement).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
	});

	it("answers an unknown id exactly like an unpublished one", async () => {
		mockPayload.findByID.mockResolvedValue(null);

		const result = await toggleLikeReview("1", true);

		expect(atomicIncrement).not.toHaveBeenCalled();
		// Same message as the draft and scheduled cases above: a distinct
		// reply would tell a client that the review exists.
		expect(result.success).toBe(false);
		expect(result.error).toBe("Review not found");
	});

	it("still decrements a published review", async () => {
		const result = await toggleLikeReview("1", false);

		expect(result.success).toBe(true);
		expect(result.newLikes).toBe(5);
		expect(atomicDecrement).toHaveBeenCalledWith(1, "likes");
		expect(atomicIncrement).not.toHaveBeenCalled();
	});

	it("keeps the rate limit ahead of the visibility check", async () => {
		rateLimitResult = { success: false, remaining: 0, resetInSeconds: 30 };

		const result = await toggleLikeReview("1", true);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Too many requests");
		expect(mockPayload.findByID).not.toHaveBeenCalled();
		expect(atomicIncrement).not.toHaveBeenCalled();
	});

	it("rejects a non-numeric id before reaching the database", async () => {
		const result = await toggleLikeReview("not-an-id", true);

		expect(result.success).toBe(false);
		expect(mockPayload.findByID).not.toHaveBeenCalled();
		expect(atomicIncrement).not.toHaveBeenCalled();
	});
});
