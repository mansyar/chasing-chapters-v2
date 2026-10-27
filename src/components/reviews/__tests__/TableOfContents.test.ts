import { describe, expect, test } from "bun:test";
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
});
