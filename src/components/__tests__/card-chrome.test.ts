import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { ReadingListCard } from "@/components/ReadingListCard";
import { ReviewCard } from "@/components/ReviewCard";
import type { Media, ReadingList, Review } from "@/payload-types";
import { renderStatic } from "./helpers/render-static";

/**
 * `AC-1` (track 20261027-typography-residuals): the card consolidation is
 * proven by rendered output, not by shared source.
 *
 * `ReviewCard` and `ReadingListCard` used to duplicate the whole-card chrome
 * character for character; now both take it from the shared `CardLink` in
 * `src/components/ui/card.tsx`. Asserting that both files import one function
 * would still pass if a call site stopped rendering it, so this suite renders
 * both cards through the shared harness and asserts the chrome region of the
 * markup is identical.
 */

const coverlessCover: Media = {
	id: 11,
	alt: "",
	updatedAt: "2026-01-01T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	url: null,
};

const review: Review = {
	id: 1,
	title: "The Lighthouse Keeper",
	bookAuthor: "A. Writer",
	rating: 4,
	coverImage: coverlessCover,
	author: 1,
	slug: "the-lighthouse-keeper",
	publishDate: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
};

const readingList: ReadingList = {
	id: 2,
	title: "Cozy Mysteries",
	description: "Soft crimes, warm drinks.",
	author: 1,
	coverImage: coverlessCover,
	reviews: [],
	slug: "cozy-mysteries",
	updatedAt: "2026-01-01T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
};

/**
 * The chrome region of a rendered card: the outer link (minus its destination,
 * which differs per card) and the inner card surface. Everything inside is
 * card-specific content, not chrome.
 */
function chromeOf(html: string): string {
	const anchor = html.match(/<a[^>]*>/)?.[0] ?? "";
	const card = html.match(/<div data-slot="card"[^>]*>/)?.[0] ?? "";

	return `${anchor.replace(/ href="[^"]*"/, "")}\n${card}`;
}

describe("card chrome consolidation", () => {
	test("both cards render the same chrome from the shared CardLink", () => {
		const reviewHtml = renderStatic(
			createElement(ReviewCard, {
				review,
				ratingLabel: "Rated {rating} out of 5",
			}),
		);
		const listHtml = renderStatic(
			createElement(ReadingListCard, { readingList }),
		);

		// Sanity: both actually rendered their content around the chrome.
		expect(reviewHtml).toContain("The Lighthouse Keeper");
		expect(listHtml).toContain("Cozy Mysteries");

		expect(chromeOf(reviewHtml)).not.toBe("\n");
		expect(chromeOf(reviewHtml)).toBe(chromeOf(listHtml));
	});

	test("the shared chrome carries the hover-lift treatment", () => {
		const html = renderStatic(
			createElement(ReviewCard, {
				review,
				ratingLabel: "Rated {rating} out of 5",
			}),
		);

		expect(html).toContain("group block h-full");
		expect(html).toContain("overflow-hidden");
		expect(html).toContain("hover:-translate-y-1");
		expect(html).toContain('data-slot="card"');
	});

	test("the reading-list cover forwards its `sizes` prop to the image", () => {
		const cover: Media = {
			...coverlessCover,
			url: "/covers/cozy-mysteries.jpg",
		};
		const customSizes = "(max-width: 640px) 100vw, 50vw";

		const html = renderStatic(
			createElement(ReadingListCard, {
				readingList: { ...readingList, coverImage: cover },
				sizes: customSizes,
			}),
		);

		expect(html).toContain(`sizes="${customSizes}"`);
	});

	test("the default `sizes` describes the home page grid", () => {
		const cover: Media = {
			...coverlessCover,
			url: "/covers/cozy-mysteries.jpg",
		};

		const html = renderStatic(
			createElement(ReadingListCard, {
				readingList: { ...readingList, coverImage: cover },
			}),
		);

		expect(html).toContain('sizes="(max-width: 1023px) 50vw, 25vw"');
	});
});
