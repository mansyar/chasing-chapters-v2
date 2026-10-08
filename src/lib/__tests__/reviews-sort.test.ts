import { describe, expect, it } from "bun:test";
import {
	parseSortParam,
	SORT_OPTIONS,
	type SortOption,
	sortToPayloadSort,
} from "../reviews-sort";

describe("reviews-sort", () => {
	describe("parseSortParam", () => {
		it("accepts every supported sort value", () => {
			for (const option of SORT_OPTIONS) {
				expect(parseSortParam(option)).toBe(option);
			}
		});

		it("falls back to recent for invalid values", () => {
			expect(parseSortParam("bogus")).toBe("recent");
			expect(parseSortParam("RATING")).toBe("recent");
			expect(parseSortParam("-publishDate")).toBe("recent");
		});

		it("falls back to recent for missing values", () => {
			expect(parseSortParam(undefined)).toBe("recent");
			expect(parseSortParam(null)).toBe("recent");
			expect(parseSortParam("")).toBe("recent");
		});
	});

	describe("sortToPayloadSort", () => {
		it("sorts recent by publishDate descending", () => {
			expect(sortToPayloadSort("recent")).toBe("-publishDate");
		});

		it("sorts rating descending with publishDate tie-break", () => {
			expect(sortToPayloadSort("rating")).toBe("-rating,-publishDate");
		});

		it("sorts title ascending", () => {
			expect(sortToPayloadSort("title")).toBe("title");
		});
	});

	describe("SortOption values", () => {
		it("contains exactly the three supported options", () => {
			expect([...SORT_OPTIONS]).toEqual(["recent", "rating", "title"]);
			const check: SortOption = "recent";
			expect(check).toBe("recent");
		});
	});
});
