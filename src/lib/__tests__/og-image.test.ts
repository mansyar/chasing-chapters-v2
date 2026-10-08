import { describe, expect, it } from "bun:test";
import {
	buildReadingListOgProps,
	buildReviewOgProps,
	clampRating,
	truncate,
} from "../og-image";

describe("truncate", () => {
	it("returns short text unchanged", () => {
		expect(truncate("Hello", 60)).toBe("Hello");
	});

	it("returns text exactly at the limit unchanged", () => {
		const text = "a".repeat(60);
		expect(truncate(text, 60)).toBe(text);
	});

	it("truncates long text with an ellipsis", () => {
		const text = "a".repeat(80);
		const result = truncate(text, 60);
		expect(result.length).toBe(60);
		expect(result.endsWith("…")).toBe(true);
	});

	it("returns empty string for empty input", () => {
		expect(truncate("", 60)).toBe("");
	});

	it("handles undefined input with a fallback", () => {
		expect(truncate(undefined, 60, "Fallback")).toBe("Fallback");
	});
});

describe("clampRating", () => {
	it("passes through valid ratings", () => {
		expect(clampRating(1)).toBe(1);
		expect(clampRating(5)).toBe(5);
		expect(clampRating(3)).toBe(3);
	});

	it("clamps below the minimum", () => {
		expect(clampRating(0)).toBe(1);
		expect(clampRating(-2)).toBe(1);
	});

	it("clamps above the maximum", () => {
		expect(clampRating(6)).toBe(5);
		expect(clampRating(99)).toBe(5);
	});

	it("falls back to a sensible default for invalid input", () => {
		expect(clampRating(undefined)).toBe(0);
		expect(clampRating(Number.NaN)).toBe(0);
	});
});

describe("buildReviewOgProps", () => {
	it("builds props from a full review", () => {
		const props = buildReviewOgProps({
			title: "A Wonderful Book",
			bookAuthor: "Jane Author",
			rating: 4,
		});
		expect(props.title).toBe("A Wonderful Book");
		expect(props.author).toBe("Jane Author");
		expect(props.rating).toBe(4);
		expect(props.siteName).toBe("Chasing Chapters");
	});

	it("truncates very long titles and author names", () => {
		const props = buildReviewOgProps({
			title: "T".repeat(120),
			bookAuthor: "A".repeat(100),
			rating: 5,
		});
		expect(props.title.length).toBeLessThanOrEqual(80);
		expect(props.author.length).toBeLessThanOrEqual(60);
	});

	it("uses fallbacks when fields are missing", () => {
		const props = buildReviewOgProps({
			title: "",
			bookAuthor: "",
			rating: undefined,
		});
		expect(props.title).toBe("Untitled Review");
		expect(props.author).toBe("Unknown Author");
		expect(props.rating).toBe(0);
	});

	it("clamps out-of-range ratings", () => {
		const props = buildReviewOgProps({
			title: "X",
			bookAuthor: "Y",
			rating: 12,
		});
		expect(props.rating).toBe(5);
	});
});

describe("buildReadingListOgProps", () => {
	it("builds props from a reading list with a book count", () => {
		const props = buildReadingListOgProps({
			title: "Summer Reads",
			bookCount: 7,
		});
		expect(props.title).toBe("Summer Reads");
		expect(props.subtitle).toBe("Reading List");
		expect(props.bookCount).toBe(7);
		expect(props.siteName).toBe("Chasing Chapters");
	});

	it("uses fallbacks when fields are missing", () => {
		const props = buildReadingListOgProps({
			title: "",
			bookCount: undefined,
		});
		expect(props.title).toBe("Untitled Reading List");
		expect(props.bookCount).toBe(0);
	});
});
