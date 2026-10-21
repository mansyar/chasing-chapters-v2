import { describe, expect, it } from "bun:test";
import {
	buildBulkCandidateWhere,
	formatBulkOutcomeLines,
	summarizeBulkOutcomes,
} from "../bulk-retranslate";

describe("buildBulkCandidateWhere", () => {
	it("only asks for failed and stale reviews", () => {
		expect(buildBulkCandidateWhere()).toEqual({
			or: [
				{ translationStatus: { equals: "failed" } },
				{ translationStatus: { equals: "stale" } },
			],
		});
	});
});

describe("summarizeBulkOutcomes", () => {
	it("counts every outcome kind", () => {
		const summary = summarizeBulkOutcomes([
			{ id: 1, status: "translated" },
			{ id: 2, status: "translated" },
			{ id: 3, status: "failed", reason: "quota" },
			{ id: 4, status: "skipped", reason: "not accessible" },
		]);

		expect(summary).toMatchObject({
			total: 4,
			translated: 2,
			failed: 1,
			skipped: 1,
		});
		expect(summary.message).toBe(
			"4 reviews: 2 translated, 1 failed, 1 skipped",
		);
	});

	it("reports nothing to do for an empty run", () => {
		const summary = summarizeBulkOutcomes([]);
		expect(summary.message).toBe("Nothing to do");
		expect(summary.total).toBe(0);
	});

	it("uses the singular form for a single review", () => {
		const summary = summarizeBulkOutcomes([{ id: 1, status: "translated" }]);
		expect(summary.message).toBe("1 review: 1 translated");
	});

	it("omits the outcome kinds that did not happen", () => {
		const summary = summarizeBulkOutcomes([{ id: 1, status: "translated" }]);
		expect(summary.message).not.toContain("failed");
		expect(summary.message).not.toContain("skipped");
	});
});

describe("formatBulkOutcomeLines", () => {
	it("lists failures and skips before the successes", () => {
		const lines = formatBulkOutcomeLines([
			{ id: 1, status: "translated" },
			{ id: 2, status: "failed", reason: "quota exceeded" },
			{ id: 3, status: "skipped", reason: "not accessible" },
		]);

		expect(lines).toEqual([
			"Review 2: failed — quota exceeded",
			"Review 3: skipped — not accessible",
			"Review 1: translated",
		]);
	});

	it("omits the reason when there is none", () => {
		expect(formatBulkOutcomeLines([{ id: 7, status: "translated" }])).toEqual([
			"Review 7: translated",
		]);
	});
});
