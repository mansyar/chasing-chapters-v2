import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEW_PATH,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

const FIXTURE_REVIEW_URL = localePath(E2E_FIXTURE_REVIEW_PATH);
const FIXTURE_REVIEW_URL_ID = localePath(E2E_FIXTURE_REVIEW_PATH, "id");

test.describe("Review Detail Page", () => {
	// Every test opens the review the fixture seeds, so the assertions run
	// against a known document instead of whichever review happens to be first.
	test.beforeEach(async ({ page }) => {
		await page.goto(FIXTURE_REVIEW_URL);
	});

	test("should display review content", async ({ page }) => {
		// Should have a title (h1)
		const title = page.locator("h1").first();
		await expect(title).toBeVisible();
		await expect(title).toHaveText(E2E_FIXTURE_REVIEW.title);

		// Should have author info (by [author])
		const authorInfo = page.getByText(/^by /);
		await expect(authorInfo).toBeVisible();
		await expect(
			page.getByText(`by ${E2E_FIXTURE_REVIEW.bookAuthor}`),
		).toBeVisible();
	});

	test("should display rating stars", async ({ page }) => {
		// Stars should be displayed (Lucide star icons are SVGs)
		const stars = page.locator("svg");
		await expect(stars.first()).toBeVisible();
	});

	test("should display genre badges", async ({ page }) => {
		// Look for badge elements (secondary variant from shadcn)
		const badges = page.locator('[class*="inline-flex"][class*="rounded"]');
		await expect(badges.first()).toBeVisible();
	});

	test("should display language toggle button", async ({ page }) => {
		// Language toggle should have EN and ID buttons (use first() since there may be multiple on page)
		const enButton = page.getByRole("button", { name: "EN" }).first();
		const idButton = page.getByRole("button", { name: "ID" }).first();
		await expect(enButton).toBeVisible();
		await expect(idButton).toBeVisible();
	});

	test("should toggle language when clicking ID button", async ({ page }) => {
		// Get initial URL
		const initialUrl = page.url();

		// Click ID button to switch language (use first() since there may be multiple on page)
		const idButton = page.getByRole("button", { name: "ID" }).first();
		await idButton.click();

		// Wait for navigation to complete
		await page.waitForURL(FIXTURE_REVIEW_URL_ID);

		// The locale moved into the path, so the query string stays clean
		expect(new URL(page.url()).pathname).toBe(FIXTURE_REVIEW_URL_ID);
		expect(page.url()).not.toContain("locale=");
		expect(page.url()).not.toBe(initialUrl);
	});

	test("should display like button", async ({ page }) => {
		// Like button should be visible with heart icon
		const likeButton = page.getByRole("button", { name: /heart|like/i });
		await expect(likeButton).toBeVisible();
	});

	test("should display share button", async ({ page }) => {
		// Share button should be visible
		const shareButton = page.getByRole("button", { name: /share/i });
		await expect(shareButton).toBeVisible();
	});

	test("should display comment section", async ({ page }) => {
		// Comment form should be visible
		const commentForm = page.locator("form").filter({ hasText: /comment/i });
		await expect(commentForm).toBeVisible();
	});

	// The fixture fills the structured sections, so they are always rendered.
	test("should display the structured review sections", async ({ page }) => {
		await expect(
			page.getByRole("heading", { name: /What I Loved/i }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: /What Could Be Better/i }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: /Perfect For/i }),
		).toBeVisible();
	});

	// The fixture review carries a favorite quote, so the quote block renders.
	test("should display the favorite quote", async ({ page }) => {
		const quote = page.getByText(E2E_FIXTURE_REVIEW.favoriteQuotes[0].quote);
		await expect(quote).toBeVisible();
	});
});
