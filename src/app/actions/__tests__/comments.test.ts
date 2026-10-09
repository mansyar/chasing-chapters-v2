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

let submitComment: typeof import("../comments").submitComment;

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
	mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

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
		({ submitComment } = await import("../comments"));
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
