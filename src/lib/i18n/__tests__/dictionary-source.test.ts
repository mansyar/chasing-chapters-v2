import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `AC-4`: no public page or component still carries a hardcoded user-facing
 * English literal.
 *
 * This is deliberately a narrow scan rather than an English-language linter. A
 * general "is this English?" check drowns in class names, slugs, CSS tokens and
 * code identifiers, so instead we assert something specific and cheap: none of
 * the strings this phase moved into the dictionary still appears in the source
 * of the public tree. Every entry below was a real literal in a page or
 * component before the migration, so a regression that reintroduces one fails
 * here by name.
 */
const MOVED_STRINGS = [
	// Document shell
	"Skip to content",
	// Navigation and footer
	"Reading Lists",
	"Write a Review",
	"Search books...",
	"Toggle search",
	"Toggle menu",
	"A personal space for book lovers.",
	"All rights reserved.",
	"RSS feed of latest reviews",
	// Home
	"Curated Reading Lists",
	"Latest Reviews",
	"View All",
	"No reviews yet",
	"The first reviews are being written",
	"Featured Review",
	"Read Full Review",
	"Featured reviews carousel",
	"Previous review",
	"Next review",
	// Review browse
	"All Genres",
	"All Reviews",
	"Search Results for",
	"Clear Filters",
	"Clear all filters",
	"No reviews found",
	"Try a different search term",
	"Sort by",
	"Most Recent",
	"Highest Rated",
	"Title A–Z",
	"Select a genre",
	"Go to previous page",
	"Go to next page",
	"More pages",
	// Review detail
	"What I Loved",
	"What Could Be Better",
	"Perfect For",
	"Favorite Quotes",
	"Reading Log",
	"More Like This",
	"Based on genres, tags, and moods",
	"On this page",
	"Copy link",
	"Copy quote",
	"Share quote",
	// Share and like
	"Link copied to clipboard",
	"Failed to copy link",
	// Comments
	"Loading comments...",
	"Leave a Comment",
	"Your name",
	"Your email won't be published",
	"Share your thoughts...",
	"Submit Comment",
	"Submitting...",
	"Report comment",
	"Report this comment as inappropriate",
	"Your email (for verification)",
	"No comments yet. Be the first",
	// Reading lists
	"Curated collections of books for every mood and occasion.",
	"No reading lists yet",
	"Curated collections of reviews are on the way",
	"No reviews added to this list yet.",
	"No Image",
	// About
	"About Chasing Chapters",
	"A digital sanctuary for book lovers",
	"Our Story",
	"Chasing Chapters began as a simple reading journal",
	"We believe that every book has the right reader",
	"Explore Reviews",
	"What We Value",
	"The core principles that guide our reading",
	// Not found
	"Chapter Missing",
	"Return Home",
	"Browse Reading Lists",
];

/** Every `.tsx`/`.ts` file under a directory, recursively. */
function sourceFiles(directory: string): string[] {
	const absolute = join(process.cwd(), directory);
	const found: string[] = [];

	const walk = (current: string) => {
		for (const entry of readdirSync(current)) {
			const path = join(current, entry);

			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}

			if (path.endsWith(".tsx") || path.endsWith(".ts")) {
				found.push(path);
			}
		}
	};

	walk(absolute);

	return found;
}

/**
 * The source with its comments removed.
 *
 * The skeleton files describe what they stand in for in comments ("Latest
 * Reviews Skeleton"), and prose in a comment is not copy a reader ever sees.
 * Only whole-line `//` comments and block comments are stripped, so a protocol
 * separator inside a string is left alone.
 */
function withoutComments(source: string): string {
	return source
		.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
		.replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The strings a reader can actually see: JSX text nodes and the attributes that
 * carry interface copy.
 *
 * Scanning the whole file instead would flag document metadata (`title:
 * "Reading Lists"` in a `metadata` export) and JSON-LD names, which are Phase 3
 * surface and are deliberately left alone. Only text between tags and the
 * user-facing attributes are extracted, which is the narrow AC-4 claim: no
 * visible label is still a literal.
 */
function visibleStrings(source: string): string[] {
	const text = source.match(/>([^<>{}]+)</g) ?? [];
	const attributes =
		source.match(/\b(?:placeholder|aria-label|title|alt)="([^"]*)"/g) ?? [];

	return [...text, ...attributes]
		.map((value) => value.replace(/^[>"']|[<"']$/g, ""))
		.map((value) => value.replace(/\s+/g, " ").trim())
		.filter((value) => /[A-Za-z]{3}/.test(value));
}

// The admin console keeps its own English interface, and the Open Graph image
// text is document metadata — both are other phases' surface, not the public
// chrome this scan guards. Test files are also excluded: they must contain the
// expected literals to assert rendered output, and they never ship to readers.
const SKIPPED_DIRECTORIES = ["src/components/admin", "src/components/og"];
const SKIPPED_SEGMENTS = ["__tests__"];

const SCANNED_ROOTS = ["src/app/(public)", "src/components"];

/** The public source, plus the root 404 which owns its own document shell. */
const SCANNED_FILES = [
	...SCANNED_ROOTS.flatMap(sourceFiles).filter(
		(file) =>
			!SKIPPED_DIRECTORIES.some((directory) =>
				file.includes(join(process.cwd(), directory)),
			) && !SKIPPED_SEGMENTS.some((segment) => file.includes(segment)),
	),
	join(process.cwd(), "src/app/not-found.tsx"),
];

describe("hardcoded interface copy", () => {
	test("the scan actually reads the public tree", () => {
		// A glob that silently matched nothing would make every assertion below
		// pass for the wrong reason.
		expect(SCANNED_FILES.length).toBeGreaterThan(20);
	});

	test("no scanned file still contains a literal this phase moved", () => {
		const offenders: string[] = [];

		for (const file of SCANNED_FILES) {
			const source = withoutComments(readFileSync(file, "utf8"));

			for (const visible of visibleStrings(source)) {
				const match = MOVED_STRINGS.find((literal) =>
					visible.includes(literal),
				);

				if (match) {
					offenders.push(
						`${relative(process.cwd(), file)}: "${match}" in "${visible}"`,
					);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	// `NFR-2`: strings are resolved on the server and reach a client component as
	// props, so a `"use client"` file that imports the dictionary is a bundle
	// regression even when the copy is right. A type-only import is erased by the
	// compiler and is how those components name the prop they receive, so it is
	// not a regression.
	test("no client component imports the server dictionary", () => {
		const valueImport =
			/import\s+(?!type\b)[^;]*?from\s+"@\/lib\/i18n\/dictionary"/;
		const importers = SCANNED_FILES.filter((file) => {
			const source = readFileSync(file, "utf8");

			return source.includes('"use client"') && valueImport.test(source);
		}).map((file) => relative(process.cwd(), file));

		expect(importers).toEqual([]);
	});
});
