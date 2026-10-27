import { describe, expect, test } from "bun:test";

import {
	countLexicalWords,
	countReviewWords,
	countWords,
	estimateReadingMinutes,
	formatReadingTime,
	READING_WORDS_PER_MINUTE,
} from "../reading-time";
import type { LexicalDocument, LexicalNode } from "../toc-extract";

/** One Lexical block carrying plain text. */
function block(type: string, text: string): LexicalNode {
	return {
		type,
		version: 1,
		children: [{ type: "text", text, version: 1 }],
	};
}

/** A Lexical document from paragraph text. */
function doc(...paragraphs: string[]): LexicalDocument {
	return {
		root: {
			type: "root",
			children: paragraphs.map((text) => block("paragraph", text)),
			direction: null,
			format: "",
			indent: 0,
			version: 1,
		},
	};
}

/** A document with exactly `count` words of body text. */
function words(count: number): LexicalDocument {
	return doc(Array.from({ length: count }, () => "word").join(" "));
}

describe("countWords", () => {
	test("counts words separated by whitespace", () => {
		expect(countWords("the quick brown fox")).toBe(4);
	});

	test("ignores extra whitespace and blank input", () => {
		expect(countWords("  spaced\tout\nwords  ")).toBe(3);
		expect(countWords("")).toBe(0);
		expect(countWords("   ")).toBe(0);
	});
});

describe("countLexicalWords", () => {
	test("counts text across Lexical nodes", () => {
		expect(countLexicalWords(doc("hello world", "one more"))).toBe(4);
	});

	test("returns zero for null, undefined, or text-free documents", () => {
		expect(countLexicalWords(null)).toBe(0);
		expect(countLexicalWords(undefined)).toBe(0);
		expect(countLexicalWords(doc())).toBe(0);
	});
});

describe("countReviewWords", () => {
	test("sums body, structured sections, and quotes", () => {
		expect(
			countReviewWords({
				body: doc("one two three"),
				whatILoved: doc("four five"),
				whatCouldBeBetter: doc("six"),
				perfectFor: doc("seven eight"),
				favoriteQuotes: [{ quote: "nine ten eleven" }],
			}),
		).toBe(11);
	});

	test("skips missing sections and empty quotes", () => {
		expect(
			countReviewWords({
				body: doc("one two"),
				whatILoved: null,
				favoriteQuotes: [{ quote: "" }, { quote: "three" }],
			}),
		).toBe(3);
	});

	test("counts each locale's content independently", () => {
		const english = countReviewWords({
			body: doc("one two three four"),
		});
		const indonesian = countReviewWords({
			body: doc("satu dua"),
		});

		expect(english).toBe(4);
		expect(indonesian).toBe(2);
	});
});

describe("estimateReadingMinutes", () => {
	test(`rounds up at ${READING_WORDS_PER_MINUTE} words per minute`, () => {
		expect(estimateReadingMinutes({ body: words(200) })).toBe(1);
		expect(estimateReadingMinutes({ body: words(201) })).toBe(2);
		expect(estimateReadingMinutes({ body: words(400) })).toBe(2);
		expect(estimateReadingMinutes({ body: words(401) })).toBe(3);
	});

	test("floors empty reviews at one minute so the badge never reads zero", () => {
		expect(estimateReadingMinutes({})).toBe(1);
		expect(estimateReadingMinutes({ body: words(1) })).toBe(1);
	});

	test("adds structured sections and quotes to the total", () => {
		expect(
			estimateReadingMinutes({
				body: words(190),
				whatILoved: doc("one two three four five six seven eight nine ten"),
				favoriteQuotes: [{ quote: "eleven twelve" }],
			}),
		).toBe(2);
	});
});

describe("formatReadingTime", () => {
	test("fills the caller-provided template so copy stays in the dictionary", () => {
		expect(formatReadingTime(5, "{minutes} min read")).toBe("5 min read");
		expect(formatReadingTime(1, "{minutes} mnt baca")).toBe("1 mnt baca");
	});
});
