import { describe, expect, it } from "bun:test";
import { getDictionary } from "@/lib/i18n/dictionary";
import type { Review } from "@/payload-types";
import {
	generateBreadcrumbSchema,
	generateItemListSchema,
	generateReviewSchema,
	generateWebSiteSchema,
	SITE_URL,
} from "../structured-data";

const review = {
	id: 1,
	title: "Almanak Penjaga Mercusuar",
	slug: "the-lighthouse-keepers-almanac",
	bookAuthor: "Some Author",
	rating: 4,
	publishDate: "2026-01-15T00:00:00.000Z",
	createdAt: "2026-01-10T00:00:00.000Z",
	author: { name: "E2E Admin" },
} as Review;

describe("generateWebSiteSchema", () => {
	it("declares the locale and localizes the description and search target", () => {
		const schema = generateWebSiteSchema("id");

		expect(schema.inLanguage).toBe("id");
		expect(schema.description).toBe(getDictionary("id").metaHomeDescription);
		expect(schema.url).toBe(`${SITE_URL}/id`);
		expect(schema.potentialAction.target).toBe(
			`${SITE_URL}/id/reviews?q={search_term_string}`,
		);
	});
});

describe("generateReviewSchema", () => {
	it("declares the locale on the review and the book it reviews", () => {
		const schema = generateReviewSchema(review, "id");

		expect(schema.inLanguage).toBe("id");
		expect(schema.itemReviewed.inLanguage).toBe("id");
		expect(schema["@id"]).toBe(
			`${SITE_URL}/id/reviews/the-lighthouse-keepers-almanac/#review`,
		);
	});

	it("drops the synthetic review body instead of shipping English prose", () => {
		// The only body available without translating anything is a synthetic
		// English sentence, so the schema carries none (`FR-5`, `NFR-3`).
		expect(generateReviewSchema(review, "id")).not.toHaveProperty("reviewBody");
		expect(JSON.stringify(generateReviewSchema(review, "id"))).not.toContain(
			"comprehensive review",
		);
	});

	it("keeps the rating and the book's own fields", () => {
		const schema = generateReviewSchema(review, "en");

		expect(schema.reviewRating.ratingValue).toBe(4);
		expect(schema.itemReviewed.name).toBe(review.title);
		expect(schema.itemReviewed.author.name).toBe("Some Author");
	});
});

describe("generateBreadcrumbSchema", () => {
	it("declares the locale and keeps the localized names it is given", () => {
		const dictionary = getDictionary("id");
		const schema = generateBreadcrumbSchema(
			[
				{ name: dictionary.breadcrumbHome, url: `${SITE_URL}/id` },
				{ name: dictionary.navReviews, url: `${SITE_URL}/id/reviews` },
			],
			"id",
		);

		expect(schema.inLanguage).toBe("id");
		expect(schema.itemListElement[0]?.name).toBe("Beranda");
		expect(schema.itemListElement[1]?.name).toBe("Ulasan");
	});
});

describe("generateItemListSchema", () => {
	it("declares the locale and takes the localized list name", () => {
		const schema = generateItemListSchema(
			[{ name: "Some Book", url: `${SITE_URL}/id/reviews/some-book` }],
			getDictionary("id").browseItemListName,
			"id",
		);

		expect(schema.inLanguage).toBe("id");
		expect(schema.name).toBe("Ulasan Buku");
		expect(schema.numberOfItems).toBe(1);
	});
});
