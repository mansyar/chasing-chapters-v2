import { describe, expect, test } from "bun:test";

import {
	buildTableOfContents,
	extractBodyHeadings,
	type LexicalDocument,
	type LexicalNode,
	slugifyHeading,
} from "../toc-extract";

/** One Lexical block with the fields the extractor reads. */
function block(
	type: string,
	extra: Record<string, unknown> = {},
	children: LexicalNode[] = [],
): LexicalNode {
	return { type, version: 1, ...extra, children };
}

/** A Lexical document from top-level blocks. */
function doc(...children: LexicalNode[]): LexicalDocument {
	return {
		root: {
			type: "root",
			children,
			direction: null,
			format: "",
			indent: 0,
			version: 1,
		},
	};
}

function paragraph(text: string): LexicalNode {
	return block("paragraph", {}, [{ type: "text", text, version: 1 }]);
}

function heading(tag: string, text: string): LexicalNode {
	return block("heading", { tag }, [{ type: "text", text, version: 1 }]);
}

const labels = {
	whatILoved: "What I Loved",
	whatCouldBeBetter: "What Could Be Better",
	perfectFor: "Perfect For",
	favoriteQuotes: "Favorite Quotes",
};

describe("slugifyHeading", () => {
	test("lowercases and converts spaces to hyphens", () => {
		expect(slugifyHeading("The Opening Chapter")).toBe("the-opening-chapter");
	});

	test("strips diacritics via unicode normalization", () => {
		expect(slugifyHeading("Café Society")).toBe("cafe-society");
	});

	test("strips emoji and special characters", () => {
		expect(slugifyHeading("🎉 Party Time!")).toBe("party-time");
		expect(slugifyHeading("What?! #1 — Read This")).toBe("what-1-read-this");
	});

	test("collapses repeated separators and trims edges", () => {
		expect(slugifyHeading("  A  --  B  ")).toBe("a-b");
	});

	test("returns empty string when nothing slug-safe remains", () => {
		expect(slugifyHeading("")).toBe("");
		expect(slugifyHeading("🎉🔥")).toBe("");
		expect(slugifyHeading("---")).toBe("");
	});
});

describe("extractBodyHeadings", () => {
	test("walks H2/H3 in document order with levels", () => {
		const content = doc(
			paragraph("Intro"),
			heading("h2", "First Part"),
			paragraph("Body"),
			heading("h3", "A Detail"),
			heading("h2", "Second Part"),
		);

		expect(extractBodyHeadings(content)).toEqual([
			{ title: "First Part", level: 2 },
			{ title: "A Detail", level: 3 },
			{ title: "Second Part", level: 2 },
		]);
	});

	test("ignores paragraphs and non-H2/H3 headings", () => {
		const content = doc(
			paragraph("Intro"),
			heading("h1", "Title"),
			heading("h4", "Fine Print"),
			heading("h2", "Kept"),
		);

		expect(extractBodyHeadings(content)).toEqual([{ title: "Kept", level: 2 }]);
	});

	test("concatenates nested inline text", () => {
		const node = block("heading", { tag: "h2" }, [
			{ text: "Bold " },
			{ text: "and " },
			{ text: "plain" },
		]);

		expect(extractBodyHeadings(doc(node))).toEqual([
			{ title: "Bold and plain", level: 2 },
		]);
	});

	test("returns empty for null, undefined, or heading-free documents", () => {
		expect(extractBodyHeadings(null)).toEqual([]);
		expect(extractBodyHeadings(undefined)).toEqual([]);
		expect(extractBodyHeadings(doc(paragraph("Only prose")))).toEqual([]);
	});
});

describe("buildTableOfContents", () => {
	test("merges body headings with fixed sections in page order", () => {
		const entries = buildTableOfContents({
			body: doc(heading("h2", "The Plot"), heading("h3", "The Twist")),
			whatILoved: doc(paragraph("Great prose.")),
			whatCouldBeBetter: doc(paragraph("Slow middle.")),
			perfectFor: doc(paragraph("Fantasy fans.")),
			favoriteQuotes: [{ quote: "So it goes." }],
			labels,
		});

		expect(entries).toEqual([
			{ slug: "the-plot", title: "The Plot", level: 2, source: "body" },
			{ slug: "the-twist", title: "The Twist", level: 3, source: "body" },
			{
				slug: "what-i-loved",
				title: "What I Loved",
				level: 2,
				source: "section",
			},
			{
				slug: "what-could-be-better",
				title: "What Could Be Better",
				level: 2,
				source: "section",
			},
			{
				slug: "perfect-for",
				title: "Perfect For",
				level: 2,
				source: "section",
			},
			{
				slug: "favorite-quotes",
				title: "Favorite Quotes",
				level: 2,
				source: "section",
			},
		]);
	});

	test("omits missing and empty sections", () => {
		const entries = buildTableOfContents({
			body: doc(heading("h2", "The Plot")),
			whatILoved: doc(paragraph("Great prose.")),
			whatCouldBeBetter: null,
			perfectFor: doc(paragraph("   ")),
			favoriteQuotes: [],
			labels,
		});

		expect(entries).toEqual([
			{ slug: "the-plot", title: "The Plot", level: 2, source: "body" },
			{
				slug: "what-i-loved",
				title: "What I Loved",
				level: 2,
				source: "section",
			},
		]);
	});

	test("dedupes duplicate heading text with -2 and -3 suffixes", () => {
		const entries = buildTableOfContents({
			body: doc(
				heading("h2", "The Plot"),
				heading("h2", "The Plot"),
				heading("h3", "The Plot"),
			),
			favoriteQuotes: [],
			labels,
		});

		expect(entries.map((entry) => entry.slug)).toEqual([
			"the-plot",
			"the-plot-2",
			"the-plot-3",
		]);
	});

	test("falls back to section-<index> when a heading has no slug-safe text", () => {
		const entries = buildTableOfContents({
			body: doc(heading("h2", "🎉🔥"), heading("h2", "The Plot")),
			favoriteQuotes: [],
			labels,
		});

		expect(entries.map((entry) => entry.slug)).toEqual([
			"section-1",
			"the-plot",
		]);
	});

	test("uses the caller's labels so headings recompute per locale", () => {
		const entries = buildTableOfContents({
			body: null,
			whatILoved: doc(paragraph("Prosa yang bagus.")),
			favoriteQuotes: [{ quote: "Begitulah." }],
			labels: {
				...labels,
				whatILoved: "Yang Saya Sukai",
				favoriteQuotes: "Kutipan Favorit",
			},
		});

		expect(entries).toEqual([
			{
				slug: "yang-saya-sukai",
				title: "Yang Saya Sukai",
				level: 2,
				source: "section",
			},
			{
				slug: "kutipan-favorit",
				title: "Kutipan Favorit",
				level: 2,
				source: "section",
			},
		]);
	});
});
