import { describe, expect, it, mock } from "bun:test";
import { Comments } from "../Comments";

type HookArgs = {
	data: {
		commenter?: number;
		content?: string;
		status?: string;
		spamSignals?: { signal?: string }[];
	};
	req: { payload: { findByID: ReturnType<typeof mock> } };
	operation: string;
};

const hook = Comments.hooks?.beforeChange?.[0] as unknown as (
	args: HookArgs,
) => Promise<HookArgs["data"] | undefined>;

const baseCommenter = { id: 7, name: "Jane", banned: false, trusted: false };

function makePayload(
	commenter: typeof baseCommenter = baseCommenter,
	failLookup = false,
) {
	return {
		findByID: mock(async (args: { collection: string }) => {
			if (failLookup) throw new Error("not found");
			if (args.collection === "commenters") return commenter;
			throw new Error("unexpected collection");
		}),
	};
}

describe("Comments collection beforeChange hook", () => {
	it("auto-approves clean content from a non-trusted commenter", async () => {
		const data = { commenter: 7, content: "Great review!" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("approved");
	});

	it("holds flagged content from a non-trusted commenter as pending", async () => {
		const data = { commenter: 7, content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
		expect(result?.spamSignals?.some((s) => s?.signal?.includes("URL"))).toBe(
			true,
		);
	});

	it("auto-approves flagged content from a trusted commenter (trust bypass)", async () => {
		const payload = makePayload({ ...baseCommenter, trusted: true });
		const data = { commenter: 7, content: "Check https://example.com" };
		const result = await hook({
			data,
			req: { payload },
			operation: "create",
		});
		expect(result?.status).toBe("approved");
	});

	it("throws for a banned commenter without resolving a status", async () => {
		const payload = makePayload({ ...baseCommenter, banned: true });
		const data = { commenter: 7, content: "Great review!" };
		await expect(
			hook({ data, req: { payload }, operation: "create" }),
		).rejects.toThrow("You are not allowed to comment.");
	});

	it("falls back to a non-trusted decision when the commenter lookup fails", async () => {
		const data = { commenter: 404, content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload(baseCommenter, true) },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
	});

	it("falls back to a non-trusted decision when no commenter is linked", async () => {
		const data = { content: "Buy viagra at https://spam.com" };
		const result = await hook({
			data,
			req: { payload: makePayload() },
			operation: "create",
		});
		expect(result?.status).toBe("pending");
	});
});
