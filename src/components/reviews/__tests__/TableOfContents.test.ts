import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";

import { renderStatic } from "@/components/__tests__/helpers/render-static";
import type { TocEntry } from "@/lib/toc-extract";
import { TableOfContents } from "../TableOfContents";

const entries: TocEntry[] = [
	{ slug: "the-plot", title: "The Plot", level: 2, source: "body" },
	{ slug: "the-twist", title: "The Twist", level: 3, source: "body" },
	{ slug: "what-i-loved", title: "What I Loved", level: 2, source: "section" },
];

describe("TableOfContents", () => {
	test("renders one anchor link per entry in order inside a labelled nav", () => {
		const html = renderStatic(
			createElement(TableOfContents, { entries, title: "On this page" }),
		);
		const positions = entries.map((entry) =>
			html.indexOf(`href="#${entry.slug}"`),
		);

		for (const position of positions) {
			expect(position).toBeGreaterThan(-1);
		}
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(html).toContain('aria-label="On this page"');
	});

	test("indents level-3 entries", () => {
		const html = renderStatic(
			createElement(TableOfContents, { entries, title: "On this page" }),
		);
		expect(html).toContain("pl-6");
	});

	test("hides entirely when entries are too few for a TOC", () => {
		const html = renderStatic(
			createElement(TableOfContents, {
				entries: entries.slice(0, 1),
				title: "On this page",
			}),
		);
		expect(html).toBe("");
	});

	test("desktop variant renders the aside without the mobile disclosure", () => {
		const html = renderStatic(
			createElement(TableOfContents, {
				entries,
				title: "On this page",
				variant: "desktop",
			}),
		);
		expect(html).toContain("<aside");
		expect(html).not.toContain("<details");
	});

	test("mobile variant renders the disclosure without the aside", () => {
		const html = renderStatic(
			createElement(TableOfContents, {
				entries,
				title: "On this page",
				variant: "mobile",
			}),
		);
		expect(html).toContain("<details");
		expect(html).not.toContain("<aside");
	});

	test("meets touch-target, focus, and token baselines", () => {
		const html = renderStatic(
			createElement(TableOfContents, { entries, title: "On this page" }),
		);

		expect(html).toContain("min-h-[44px]");
		expect(html).toContain("focus-visible:");
		expect(html).toContain("bg-card");
	});

	test("click path wires aria-current from activeSlug state", () => {
		// renderStatic never runs effects or click handlers, so the first
		// render carries no active slug: no link may claim current yet.
		const html = renderStatic(
			createElement(TableOfContents, { entries, title: "On this page" }),
		);
		expect(html).not.toContain('aria-current="location"');

		// The click upgrade path is pinned at the source level instead: the
		// handler sets the slug synchronously and each link reflects it.
		const source = readFileSync(
			join(process.cwd(), "src/components/reviews/TableOfContents.tsx"),
			"utf8",
		);
		expect(source).toContain("setActiveSlug(slug)");
		expect(source).toContain(
			'aria-current={isActive ? "location" : undefined}',
		);
	});

	test("scrollspy follows reading position and yields to recent clicks", () => {
		// Same constraint as the click-path pin above: renderStatic never
		// runs effects, so the scroll-position rule is asserted at the
		// source level without mocking what the harness cannot run.
		const source = readFileSync(
			join(process.cwd(), "src/components/reviews/TableOfContents.tsx"),
			"utf8",
		);

		// No observer band: a band with any bottom exclusion misses a
		// heading landed at the viewport bottom edge, so scroll position
		// owns the active link instead.
		expect(source).not.toContain("new IntersectionObserver");
		expect(source).not.toContain("rootMargin");

		// Reading position: the last heading whose top edge has appeared
		// on screen (at or above the viewport bottom).
		expect(source).toContain("getBoundingClientRect");
		expect(source).toContain("innerHeight");

		// Click authority: the scroll handler yields while the click lock
		// is fresh; the duration lives in one named constant.
		expect(source).toContain("lastClickAt");
		expect(source).toMatch(/CLICK_LOCK_MS\s*=\s*800/);

		// Listeners and the scheduled frame clean up on unmount.
		expect(source).toContain("removeEventListener");
		expect(source).toContain("cancelAnimationFrame");
	});
});
