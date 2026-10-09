import { beforeEach, describe, expect, it, mock } from "bun:test";
import { getModerationSummary } from "../moderation-summary";

type FindArgs = {
	collection: string;
	where?: Record<string, unknown>;
	limit?: number;
	sort?: string;
	select?: Record<string, boolean>;
};

const pendingDoc = {
	id: 11,
	authorName: "Spammy",
	content: "Buy viagra at https://spam.com",
	status: "pending",
	createdAt: "2026-10-09T10:00:00.000Z",
	spamSignals: [{ signal: "Contains URL" }],
};

const reportedDoc = {
	id: 12,
	authorName: "Rude",
	content: "You are an idiot",
	status: "reported",
	createdAt: "2026-10-09T09:00:00.000Z",
	spamSignals: [],
};

let findCalls: FindArgs[] = [];

function makePayload() {
	return {
		find: mock(async (args: FindArgs) => {
			findCalls.push(args);
			const statusFilter = ((
				args.where as { status?: { equals?: string; in?: string[] } }
			)?.status ?? {}) as { equals?: string; in?: string[] };
			if (statusFilter.equals === "pending") {
				return { totalDocs: 3, docs: [] };
			}
			if (statusFilter.equals === "reported") {
				return { totalDocs: 1, docs: [] };
			}
			if (Array.isArray(statusFilter.in)) {
				return { totalDocs: 4, docs: [pendingDoc, reportedDoc] };
			}
			throw new Error("unexpected find args");
		}),
	};
}

beforeEach(() => {
	findCalls = [];
});

describe("getModerationSummary", () => {
	it("returns pending and reported counts without loading documents", async () => {
		const summary = await getModerationSummary(makePayload() as never);

		expect(summary.pendingCount).toBe(3);
		expect(summary.reportedCount).toBe(1);
		const countCalls = findCalls.filter(
			(call) => call.limit === 0 && !call.select,
		);
		expect(countCalls).toHaveLength(2);
	});

	it("fetches the latest pending/reported comments with a select projection", async () => {
		const summary = await getModerationSummary(makePayload() as never);

		expect(summary.latest).toHaveLength(2);
		expect(summary.latest[0]).toEqual({
			id: 11,
			authorName: "Spammy",
			content: "Buy viagra at https://spam.com",
			status: "pending",
			createdAt: "2026-10-09T10:00:00.000Z",
			spamSignals: [{ signal: "Contains URL" }],
		});
		const latestCall = findCalls.find((call) => call.select);
		expect(latestCall?.limit).toBe(5);
		expect(latestCall?.sort).toBe("-createdAt");
		expect(latestCall?.select).toEqual(
			expect.objectContaining({ authorName: true, content: true }),
		);
	});

	it("supports a custom latest limit", async () => {
		await getModerationSummary(makePayload() as never, 3);

		const latestCall = findCalls.find((call) => call.select);
		expect(latestCall?.limit).toBe(3);
	});

	it("returns empty data when there is nothing to moderate", async () => {
		const emptyPayload = {
			find: mock(async () => ({ totalDocs: 0, docs: [] })),
		};
		const summary = await getModerationSummary(emptyPayload as never);

		expect(summary.pendingCount).toBe(0);
		expect(summary.reportedCount).toBe(0);
		expect(summary.latest).toEqual([]);
	});
});
