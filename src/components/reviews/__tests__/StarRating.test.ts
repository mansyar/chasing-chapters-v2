import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";

import { ReviewCard } from "@/components/ReviewCard";
import { StarRating } from "@/components/reviews/StarRating";
import type { Review } from "@/payload-types";
import { renderStatic } from "../../__tests__/helpers/render-static";

/** The English label template, the same string the `en` dictionary carries. */
const EN_LABEL = "Rated {rating} out of 5";
/** The Indonesian label template, the same string the `id` dictionary carries. */
const ID_LABEL = "Dinilai {rating} dari 5";

function render(
	props: Partial<Parameters<typeof StarRating>[0]> &
		Pick<Parameters<typeof StarRating>[0], "rating" | "labelTemplate">,
): string {
	return renderStatic(createElement(StarRating, props));
}

describe("StarRating", () => {
	describe("size variants", () => {
		test("sm matches the former ReviewCard renderer", () => {
			const html = render({ rating: 3, labelTemplate: EN_LABEL, size: "sm" });
			expect(html).toContain('class="flex gap-1"');
			expect(html).toContain("h-3.5 w-3.5");
		});

		test("md (the default) matches the former hero and carousel renderer", () => {
			const html = render({ rating: 3, labelTemplate: EN_LABEL });
			expect(html).toContain('class="flex gap-0.5"');
			expect(html).toContain("h-4 w-4");
		});

		test("lg matches the former review detail renderer", () => {
			const html = render({ rating: 3, labelTemplate: EN_LABEL, size: "lg" });
			expect(html).toContain('class="flex gap-2"');
			expect(html).toContain("h-5 w-5");
		});
	});

	describe("extremes", () => {
		test("rating 5 renders five filled stars and no empty ones", () => {
			const html = render({ rating: 5, labelTemplate: EN_LABEL });
			expect(html.split("fill-primary").length - 1).toBe(5);
			expect(html).not.toContain("text-muted-foreground/30");
		});

		test("rating 1 renders one filled star and four empty ones", () => {
			const html = render({ rating: 1, labelTemplate: EN_LABEL });
			expect(html.split("fill-primary").length - 1).toBe(1);
			expect(html.split("text-muted-foreground/30").length - 1).toBe(4);
		});

		test("rating 3 renders three filled and two empty", () => {
			const html = render({ rating: 3, labelTemplate: EN_LABEL });
			expect(html.split("fill-primary").length - 1).toBe(3);
			expect(html.split("text-muted-foreground/30").length - 1).toBe(2);
		});
	});

	describe("accessible label", () => {
		test("the localized template is filled and rendered screen-reader-only", () => {
			const html = render({ rating: 4, labelTemplate: EN_LABEL });
			expect(html).toContain("Rated 4 out of 5");
			expect(html).toContain("sr-only");
		});

		test("the Indonesian template renders its own wording", () => {
			const html = render({ rating: 2, labelTemplate: ID_LABEL });
			expect(html).toContain("Dinilai 2 dari 5");
		});
	});

	describe("out-of-range ratings are clamped, not nonsense", () => {
		test("above 5 clamps to five filled and announces 5", () => {
			const html = render({ rating: 9, labelTemplate: EN_LABEL });
			expect(html.split("fill-primary").length - 1).toBe(5);
			expect(html).toContain("Rated 5 out of 5");
		});

		test("below 0 clamps to zero filled and announces 0", () => {
			const html = render({ rating: -2, labelTemplate: EN_LABEL });
			expect(html).not.toContain("fill-primary");
			expect(html.split("text-muted-foreground/30").length - 1).toBe(5);
			expect(html).toContain("Rated 0 out of 5");
		});
	});

	describe("call sites", () => {
		/**
		 * AC-2: every former inline renderer uses the component, proven by
		 * rendered output through the shared harness: each caller renders and
		 * the accessible label it passes the rating through is in the markup.
		 * A source assertion would still pass if a call site kept the import
		 * and stopped rendering the component.
		 *
		 * ReviewCard renders here. FeaturedHero and ModernBookCarousel render
		 * in `src/components/__tests__/star-rating-call-sites.test.ts`: that
		 * file imports the server dictionary for their props, so it cannot
		 * share a file with the client-boundary assertion below (the
		 * dictionary-source guard scans test files too).
		 *
		 * The review detail page is the exception: it is an async server
		 * component that fetches from Payload, so it cannot render in a unit
		 * test and its wiring stays source-pinned.
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

		test("ReviewCard renders StarRating with the caller's label template", () => {
			const html = renderStatic(
				createElement(ReviewCard, {
					review: cardReview,
					ratingLabel: EN_LABEL,
				}),
			);

			expect(html).toContain("Rated 4 out of 5");
			expect(html).toContain("fill-primary");
		});

		test("the review detail page wires StarRating with a labelTemplate", () => {
			const source = readFileSync(
				join(
					process.cwd(),
					"src/app/(public)/[locale]/reviews/[slug]/page.tsx",
				),
				"utf8",
			);

			expect(source).toContain("reviews/StarRating");
			expect(source).toContain("<StarRating");
			expect(source).toContain("labelTemplate=");
		});

		test("StarRating itself ships no client boundary", () => {
			// Inherently source-level: rendering succeeds either way, so no
			// rendered output can prove the directive is absent.
			const source = readFileSync(
				join(process.cwd(), "src/components/reviews/StarRating.tsx"),
				"utf8",
			);
			expect(source).not.toContain('"use client"');
		});
	});
});
