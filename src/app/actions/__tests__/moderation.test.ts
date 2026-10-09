import { beforeEach, describe, expect, it, mock } from "bun:test";

type PayloadMock = {
	auth: ReturnType<typeof mock>;
	update: ReturnType<typeof mock>;
};

let mockPayload: PayloadMock;
let authResult: { user?: Record<string, unknown> | null } = { user: null };

let setCommentStatus: typeof import("../moderation").setCommentStatus;

beforeEach(async () => {
	mockPayload = {
		auth: mock(async () => authResult),
		update: mock(),
	};

	mock.module("payload", () => ({
		getPayload: mock(async () => mockPayload),
	}));
	mock.module("@payload-config", () => ({ default: {} }));
	mock.module("next/headers", () => ({
		headers: async () => new Headers(),
	}));

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
});
