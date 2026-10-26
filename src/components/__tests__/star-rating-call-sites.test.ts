import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { FeaturedHero } from "@/components/FeaturedHero";
import ModernBookCarousel from "@/components/ModernBookCarousel";
import { getDictionary } from "@/lib/i18n/dictionary";
import type { Review } from "@/payload-types";
import { renderStatic } from "./helpers/render-static";

/**
 * StarRating call sites that need the server dictionary for their props.
 *
 * Lives apart from `StarRating.test.ts` on purpose: the dictionary-source
 * guard scans test files under `src/components` too, and a file that imports
 * the dictionary cannot also contain the client-directive literal that the
 * client-boundary assertion there checks. This file has no such literal, so
 * the guard stays green; the assertion it protects stays in `StarRating.test.ts`.
 */
const cardReview: Review = {
	id: 1,
	title: "The Lighthouse Keeper",
	bookAuthor: "A. Writer",
	rating: 4,
	coverImage: {
		id: 11,
		alt: "",
		updatedAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		url: null,
	},
	author: 1,
	slug: "the-lighthouse-keeper",
	publishDate: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
};

describe("StarRating call sites with dictionary props", () => {
	test("FeaturedHero renders StarRating with the dictionary label", () => {
		const html = renderStatic(
			createElement(FeaturedHero, {
				reviews: [cardReview],
				dictionary: getDictionary("en"),
				locale: "en",
			}),
		);

		expect(html).toContain("Rated 4 out of 5");
		expect(html).toContain("fill-primary");
	});

	test("ModernBookCarousel renders StarRating with the dictionary label", () => {
		const html = renderStatic(
			createElement(ModernBookCarousel, {
				reviews: [cardReview],
				dictionary: getDictionary("en"),
				locale: "en",
			}),
		);

		expect(html).toContain("Rated 4 out of 5");
		expect(html).toContain("fill-primary");
	});
});
