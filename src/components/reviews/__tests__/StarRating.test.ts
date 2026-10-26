import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StarRating } from "@/components/reviews/StarRating";

/** The English label template, the same string the `en` dictionary carries. */
const EN_LABEL = "Rated {rating} out of 5";
/** The Indonesian label template, the same string the `id` dictionary carries. */
const ID_LABEL = "Dinilai {rating} dari 5";

function render(
	props: Partial<Parameters<typeof StarRating>[0]> &
		Pick<Parameters<typeof StarRating>[0], "rating" | "labelTemplate">,
): string {
	return renderToStaticMarkup(createElement(StarRating, props));
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
		 * AC-3: all four former inline renderers use the component. A required
		 * `labelTemplate` prop makes every other consumer a type error, so the
		 * source assertion only needs to prove these four import it.
		 */
		const callSites = [
			"src/components/FeaturedHero.tsx",
			"src/components/ModernBookCarousel.tsx",
			"src/components/ReviewCard.tsx",
			"src/app/(public)/[locale]/reviews/[slug]/page.tsx",
		];

		for (const file of callSites) {
			test(`${file} imports StarRating`, () => {
				const source = readFileSync(join(process.cwd(), file), "utf8");
				expect(source).toContain("reviews/StarRating");
			});
		}

		test("StarRating itself ships no client boundary", () => {
			const source = readFileSync(
				join(process.cwd(), "src/components/reviews/StarRating.tsx"),
				"utf8",
			);
			expect(source).not.toContain('"use client"');
		});
	});
});
