import { describe, expect, it } from "bun:test";
import {
	BULK_RETRANSLATE_BUDGET_REASON,
	BULK_RETRANSLATE_CHARACTER_BUDGET_REASON,
	BULK_RETRANSLATE_MAX_IDS,
	isBulkRetranslatableStatus,
	normalizeBulkRetranslateIds,
} from "../retranslate";

describe("bulk re-translate budget reasons", () => {
	it("keeps the time-budget message unchanged", () => {
		expect(BULK_RETRANSLATE_BUDGET_REASON).toBe(
			"not attempted — batch time budget reached",
		);
	});

	it("reports the character budget with its own reason", () => {
		expect(BULK_RETRANSLATE_CHARACTER_BUDGET_REASON).toBe(
			"not attempted — translation character budget reached",
		);
		// The two limits are different failures: an operator reading the
		// outcomes must be able to tell a throttle from a timeout.
		expect(BULK_RETRANSLATE_CHARACTER_BUDGET_REASON).not.toBe(
			BULK_RETRANSLATE_BUDGET_REASON,
		);
	});
});

describe("normalizeBulkRetranslateIds", () => {
	it("rejects a non-array payload", () => {
		const result = normalizeBulkRetranslateIds({ ids: [1, 2] });
		expect(result.ids).toEqual([]);
		expect(result.error).toContain("array");
	});

	it("rejects an empty selection", () => {
		const result = normalizeBulkRetranslateIds([]);
		expect(result.ids).toEqual([]);
		expect(result.error).toBe("No review ids provided");
	});

	it("rejects a selection larger than the cap", () => {
		const ids = Array.from(
			{ length: BULK_RETRANSLATE_MAX_IDS + 1 },
			(_value, index) => index + 1,
		);
		const result = normalizeBulkRetranslateIds(ids);
		expect(result.ids).toEqual([]);
		expect(result.error).toContain(String(BULK_RETRANSLATE_MAX_IDS));
	});

	it("accepts a selection at the cap", () => {
		const ids = Array.from(
			{ length: BULK_RETRANSLATE_MAX_IDS },
			(_value, index) => index + 1,
		);
		const result = normalizeBulkRetranslateIds(ids);
		expect(result.error).toBeNull();
		expect(result.ids).toHaveLength(BULK_RETRANSLATE_MAX_IDS);
	});

	it("rejects ids that are not positive integers", () => {
		for (const invalid of [0, -3, 1.5, "abc", null, undefined, {}]) {
			const result = normalizeBulkRetranslateIds([invalid]);
			expect(result.ids).toEqual([]);
			expect(result.error).toContain("Invalid review id");
		}
	});

	it("deduplicates repeated ids and keeps the request order", () => {
		const result = normalizeBulkRetranslateIds([3, 1, 3, 2, 1]);
		expect(result.error).toBeNull();
		expect(result.ids).toEqual([3, 1, 2]);
	});

	it("accepts numeric strings", () => {
		const result = normalizeBulkRetranslateIds(["7", 8]);
		expect(result.error).toBeNull();
		expect(result.ids).toEqual([7, 8]);
	});
});

describe("isBulkRetranslatableStatus", () => {
	it("accepts the failed and stale statuses", () => {
		expect(isBulkRetranslatableStatus("failed")).toBe(true);
		expect(isBulkRetranslatableStatus("stale")).toBe(true);
	});

	it("rejects every other status", () => {
		for (const status of [
			"untranslated",
			"pending",
			"translated",
			"",
			null,
			undefined,
		]) {
			expect(isBulkRetranslatableStatus(status)).toBe(false);
		}
	});
});
