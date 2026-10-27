import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { renderStatic } from "@/components/__tests__/helpers/render-static";
import { getDictionary } from "@/lib/i18n/dictionary";
import type { Review } from "@/payload-types";
import { ReviewBody } from "../review-body";

const body: NonNullable<Review["reviewContent"]> = {
	root: {
		type: "root",
		children: [
			{
				type: "heading",
				tag: "h2",
				version: 1,
				children: [{ type: "text", text: "The Plot", version: 1 }],
			},
			{
				type: "paragraph",
				version: 1,
				children: [{ type: "text", text: "Body text.", version: 1 }],
			},
			{
				type: "heading",
				tag: "h1",
				version: 1,
				children: [{ type: "text", text: "Should Not Link", version: 1 }],
			},
			{
				type: "heading",
				tag: "h3",
				version: 1,
				children: [{ type: "text", text: "The Twist", version: 1 }],
			},
		],
		direction: null,
		format: "",
		indent: 0,
		version: 1,
	},
};

describe("ReviewBody", () => {
	test("assigns body heading slugs to H2/H3 in document order", () => {
		const html = renderStatic(
			createElement(ReviewBody, {
				data: body,
				headingSlugs: ["the-plot", "the-twist"],
				dictionary: getDictionary("en"),
			}),
		);
		expect(html).toContain('id="the-plot"');
		expect(html).toContain('id="the-twist"');
		expect(html.indexOf('id="the-plot"')).toBeLessThan(
			html.indexOf('id="the-twist"'),
		);
	});

	test("leaves non-H2/H3 headings without an anchor", () => {
		const html = renderStatic(
			createElement(ReviewBody, {
				data: body,
				headingSlugs: ["the-plot", "the-twist"],
				dictionary: getDictionary("en"),
			}),
		);
		expect(html).toContain("Should Not Link");
		expect(html).not.toContain('id="should-not-link"');
	});

	test("renders the localized copy-link button on anchored headings", () => {
		const dictionary = getDictionary("en");
		const html = renderStatic(
			createElement(ReviewBody, {
				data: body,
				headingSlugs: ["the-plot", "the-twist"],
				dictionary,
			}),
		);
		expect(
			html.split(`aria-label="${dictionary.reviewCopyLink}"`).length - 1,
		).toBe(2);
	});
});
