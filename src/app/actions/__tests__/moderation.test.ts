import { beforeEach, describe, expect, it, mock } from "bun:test";

type PayloadMock = {
	auth: ReturnType<typeof mock>;
	update: ReturnType<typeof mock>;
	findByID: ReturnType<typeof mock>;
};

const revalidatePath = mock(() => {});

let mockPayload: PayloadMock;
let authResult: { user?: Record<string, unknown> | null } = { user: null };
let commentResult: Record<string, unknown> | null = null;

let setCommentStatus: typeof import("../moderation").setCommentStatus;

beforeEach(async () => {
	authResult = { user: null };
	commentResult = {
		id: 11,
		status: "pending",
		relatedReview: { id: 3, slug: "dune" },
	};

	mockPayload = {
		auth: mock(async () => authResult),
		update: mock(async () => ({ id: 11 })),
		findByID: mock(async () => commentResult),
	};
	revalidatePath.mockClear();

	mock.module("payload", () => ({
		getPayload: mock(async () => mockPayload),
	}));
	mock.module("@payload-config", () => ({ default: {} }));
	mock.module("next/headers", () => ({
		headers: async () => new Headers(),
	}));
	mock.module("next/cache", () => ({ revalidatePath }));

	if (!setCommentStatus) {
		({ setCommentStatus } = await import("../moderation"));
	}
});

describe("setCommentStatus", () => {
	it("rejects an invalid status without touching the database", async () => {
		const result = await setCommentStatus(1, "deleted");

		expect(result.success).toBe(false);
		expect(result.error).toBe("Invalid status");
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("rejects an unauthenticated caller", async () => {
		const result = await setCommentStatus(1, "approved");

		expect(result.success).toBe(false);
		expect(result.error).toBe("Unauthorized");
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("rejects a non-admin (writer) caller", async () => {
		authResult = { user: { collection: "authors", role: "writer" } };

		const result = await setCommentStatus(1, "approved");

		expect(result.success).toBe(false);
		expect(result.error).toBe("Unauthorized");
		expect(mockPayload.update).not.toHaveBeenCalled();
	});

	it("lets an admin approve a pending comment", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };

		const result = await setCommentStatus(11, "approved");

		expect(result.success).toBe(true);
		expect(mockPayload.update).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				id: 11,
				data: { status: "approved" },
			}),
		);
	});

	it("loads the comment deeply enough to reach the review's slug", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };

		await setCommentStatus(11, "approved");

		expect(mockPayload.findByID).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: "comments",
				id: 11,
				depth: 1,
			}),
		);
	});

	it("revalidates both locale paths of the review after approving", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };

		await setCommentStatus(11, "approved");

		// The public page is ISR with a 60s window, so an approval that does
		// not revalidate is invisible for up to a minute (`FR-10`, `AC-15`).
		expect(revalidatePath).toHaveBeenCalledWith("/en/reviews/dune");
		expect(revalidatePath).toHaveBeenCalledWith("/id/reviews/dune");
		expect(revalidatePath).toHaveBeenCalledTimes(2);
	});

	it("revalidates after rejecting too, since hiding a comment is also a visible change", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };

		await setCommentStatus(11, "rejected");

		expect(revalidatePath).toHaveBeenCalledWith("/en/reviews/dune");
		expect(revalidatePath).toHaveBeenCalledWith("/id/reviews/dune");
	});

	it("does not revalidate when the caller is unauthorized", async () => {
		authResult = { user: { collection: "authors", role: "writer" } };

		await setCommentStatus(11, "approved");

		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("still succeeds when the comment's review is gone", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };
		// A deleted review leaves the relationship as a bare id, which carries
		// no slug to revalidate. The status change did happen, so the action
		// reports success rather than an error the admin cannot act on.
		commentResult = { id: 11, status: "pending", relatedReview: 3 };

		const result = await setCommentStatus(11, "approved");

		expect(result.success).toBe(true);
		expect(mockPayload.update).toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("still succeeds when the comment itself cannot be reloaded", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };
		commentResult = null;

		const result = await setCommentStatus(11, "approved");

		expect(result.success).toBe(true);
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("still succeeds when reloading the comment fails outright", async () => {
		authResult = { user: { collection: "authors", role: "admin" } };
		mockPayload.findByID.mockRejectedValue(new Error("database is down"));

		const result = await setCommentStatus(11, "approved");

		// The status change was already written, so a failure to look up the
		// review afterwards must not report a moderation that did not happen.
		expect(result.success).toBe(true);
		expect(mockPayload.update).toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});
});
