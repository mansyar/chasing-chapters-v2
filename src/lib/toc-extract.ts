/**
 * Table-of-contents extraction for the review detail page (`FR-2`).
 *
 * Everything here is pure: Lexical documents and quote rows in, slug-stable
 * entries out. Rendering (anchors, scrollspy, links) lives in Phase 2 and
 * reuses these slugs so the TOC and the headings never disagree.
 */

/** The Lexical node fields the extractor reads; everything else is ignored. */
export interface LexicalNode {
	type?: unknown;
	tag?: unknown;
	text?: unknown;
	children?: LexicalNode[];
	[key: string]: unknown;
}

/** The Lexical document fields the extractor reads. */
export interface LexicalDocument {
	root?: {
		children?: LexicalNode[];
		[key: string]: unknown;
	} | null;
	[key: string]: unknown;
}

/** A heading found in the review body, before slugs are assigned. */
export interface BodyHeading {
	title: string;
	level: 2 | 3;
}

/** One TOC row: where to link, what to show, and how to indent it. */
export interface TocEntry {
	slug: string;
	title: string;
	/** Fixed sections are top-level landmarks, so they sit at level 2. */
	level: 2 | 3;
	/** Body headings come from Lexical; sections are the fixed review blocks. */
	source: "body" | "section";
}

/**
 * The visible titles of the fixed sections.
 *
 * Labels are a parameter rather than a dictionary import so this module stays
 * client-safe (the dictionary is server-only by convention) and so headings
 * recompute when the locale switches — the caller passes that locale's
 * dictionary strings.
 */
export interface TocSectionLabels {
	whatILoved: string;
	whatCouldBeBetter: string;
	perfectFor: string;
	favoriteQuotes: string;
}

/** Everything the TOC can list, mirroring the review detail page order. */
export interface TocContentInput {
	body?: LexicalDocument | null;
	whatILoved?: LexicalDocument | null;
	whatCouldBeBetter?: LexicalDocument | null;
	perfectFor?: LexicalDocument | null;
	favoriteQuotes?: Array<{ quote: string }> | null;
	labels: TocSectionLabels;
}

/** The concatenated text of a node and its descendants. */
function nodeText(node: LexicalNode): string {
	if (typeof node.text === "string") {
		return node.text;
	}

	if (!Array.isArray(node.children)) {
		return "";
	}

	return node.children.map(nodeText).join("");
}

/**
 * The concatenated text of every text node in a Lexical document.
 *
 * Used for word counts and for deciding whether a fixed section is non-empty.
 */
export function extractLexicalText(
	content: LexicalDocument | null | undefined,
): string {
	const children = content?.root?.children;

	if (!Array.isArray(children)) {
		return "";
	}

	return children.map(nodeText).join(" ");
}

/** Whether a Lexical document carries any visible text. */
export function lexicalHasText(
	content: LexicalDocument | null | undefined,
): boolean {
	return /\S/.test(extractLexicalText(content));
}

/**
 * A URL-safe slug for a heading.
 *
 * Lowercases, strips diacritics (`Café` → `cafe`), drops emoji and punctuation,
 * and collapses separators. Returns `""` when nothing slug-safe remains — the
 * caller falls back to `section-<index>` so an id is never empty (`AC-4`).
 */
export function slugifyHeading(text: string): string {
	return text
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * The H2/H3 headings of a Lexical body document, in document order.
 *
 * Only top-level `heading` blocks with an `h2`/`h3` tag qualify — paragraphs
 * and other heading levels are not navigable sections. Empty-text headings are
 * kept (they still render an anchor target) and receive a fallback slug later.
 */
export function extractBodyHeadings(
	content: LexicalDocument | null | undefined,
): BodyHeading[] {
	const children = content?.root?.children;

	if (!Array.isArray(children)) {
		return [];
	}

	const headings: BodyHeading[] = [];

	for (const child of children) {
		if (typeof child !== "object" || child === null) {
			continue;
		}

		if (child.type !== "heading") {
			continue;
		}

		if (child.tag !== "h2" && child.tag !== "h3") {
			continue;
		}

		headings.push({
			title: nodeText(child),
			level: child.tag === "h2" ? 2 : 3,
		});
	}

	return headings;
}

/**
 * The full TOC: body H2/H3 entries followed by the fixed sections that are
 * present and non-empty, in the order the review detail page renders them.
 *
 * Slugs are unique and stable: the first use of a slug keeps it, later ones
 * take `-2`, `-3`, and headings with no slug-safe text fall back to
 * `section-<position>` (1-based among all entries).
 */
export function buildTableOfContents(input: TocContentInput): TocEntry[] {
	const used = new Map<string, number>();
	const entries: TocEntry[] = [];

	function push(title: string, level: 2 | 3, source: TocEntry["source"]): void {
		const base = slugifyHeading(title) || `section-${entries.length + 1}`;
		const seen = used.get(base) ?? 0;
		used.set(base, seen + 1);
		entries.push({
			slug: seen === 0 ? base : `${base}-${seen + 1}`,
			title,
			level,
			source,
		});
	}

	for (const heading of extractBodyHeadings(input.body)) {
		push(heading.title, heading.level, "body");
	}

	if (lexicalHasText(input.whatILoved)) {
		push(input.labels.whatILoved, 2, "section");
	}

	if (lexicalHasText(input.whatCouldBeBetter)) {
		push(input.labels.whatCouldBeBetter, 2, "section");
	}

	if (lexicalHasText(input.perfectFor)) {
		push(input.labels.perfectFor, 2, "section");
	}

	const quotes = (input.favoriteQuotes ?? []).filter(
		(item) => item.quote.trim() !== "",
	);

	if (quotes.length > 0) {
		push(input.labels.favoriteQuotes, 2, "section");
	}

	return entries;
}

/**
 * Whether the TOC block should render at all.
 *
 * A review with fewer than two entries keeps its reading-time badge but shows
 * no TOC card (`AC-8`).
 */
export function hasTableOfContents(entries: TocEntry[]): boolean {
	return entries.length >= 2;
}
