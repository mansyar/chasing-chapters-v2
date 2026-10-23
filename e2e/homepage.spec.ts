import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_READING_LIST_PATH,
	E2E_FIXTURE_REVIEWS,
} from "../src/lib/e2e-harness";

test.describe("Homepage", () => {
	test("should load successfully", async ({ page }) => {
		await page.goto("/");

		// Page title should be present
		await expect(page).toHaveTitle(/Chasing Chapters/i);
	});

	test("should display latest reviews section", async ({ page }) => {
		await page.goto("/");

		// Section heading should be visible
		const latestReviewsHeading = page.getByRole("heading", {
			name: /Latest Reviews/i,
		});
		await expect(latestReviewsHeading).toBeVisible();
	});

	test("should navigate to reviews page via View All link", async ({
		page,
	}) => {
		await page.goto("/");

		// Click View All link in Latest Reviews section
		const viewAllLink = page
			.locator("section")
			.filter({ hasText: /Latest Reviews/i })
			.getByRole("link", { name: /View All/i });
		await viewAllLink.click();

		// Should navigate to reviews page
		await expect(page).toHaveURL(/\/reviews/);
	});

	test("should display genre marquee", async ({ page }) => {
		await page.goto("/");

		// Genre section should be visible (it uses a marquee layout)
		const genreSection = page.locator('[class*="overflow-hidden"]').first();
		await expect(genreSection).toBeVisible();
	});

	// The fixture seeds two featured reviews, so the homepage always renders
	// the carousel - there is no "maybe there is a hero" branch any more.
	test("should display the featured reviews in the hero carousel", async ({
		page,
	}) => {
		await page.goto("/");

		const carousel = page.locator(
			'[role="region"][aria-label="Featured reviews carousel"]',
		);
		await expect(carousel).toBeVisible();

		for (const review of E2E_FIXTURE_REVIEWS.filter(
			(entry) => entry.featured,
		)) {
			await expect(
				carousel.getByRole("heading", { name: review.title }),
			).toBeVisible();
		}
	});

	test("should display the fixture reading list", async ({ page }) => {
		await page.goto("/");

		const readingListsHeading = page.getByRole("heading", {
			name: /Curated Reading Lists/i,
		});
		await expect(readingListsHeading).toBeVisible();

		const listLink = page.locator(`a[href="${E2E_FIXTURE_READING_LIST_PATH}"]`);
		await expect(listLink).toBeVisible();
		await expect(
			listLink.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title }),
		).toBeVisible();
	});

	// The hero carousel is server-rendered (no `ssr: false`) so its LCP cover ships
	// in the initial HTML. A hydration mismatch there would be invisible otherwise:
	// nothing else in this suite asserts the absence of console errors, so this
	// guards the change that made the hero render on the server.
	test("should server-render the featured carousel without hydration errors", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("console", (message) => {
			if (message.type() === "error") errors.push(message.text());
		});
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto("/");

		const carousel = page.locator(
			'[role="region"][aria-label="Featured reviews carousel"]',
		);
		await expect(carousel).toBeVisible();
		expect(errors).toEqual([]);
	});
});
