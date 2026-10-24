import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEW_PATH,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

const FIXTURE_REVIEW_URL = localePath(E2E_FIXTURE_REVIEW_PATH);

test.describe("Navigation", () => {
	test("should navigate to reviews page", async ({ page }) => {
		await page.goto(localePath("/reviews"));

		// Page should load without errors
		await expect(page).toHaveURL(/\/en\/reviews/);

		// Should have heading indicating this is reviews page
		const heading = page.getByRole("heading").first();
		await expect(heading).toBeVisible();
	});

	test("should display review cards on reviews page", async ({ page }) => {
		await page.goto(localePath("/reviews"));

		// Should display review cards (links to individual reviews)
		const reviewLinks = page.locator('a[href^="/en/reviews/"]');
		const count = await reviewLinks.count();

		// Should have at least one review (assuming seeded data)
		expect(count).toBeGreaterThan(0);
	});

	test("should display the fixture review on the reviews page", async ({
		page,
	}) => {
		await page.goto(localePath("/reviews"));

		const fixtureLink = page.locator(`a[href="${FIXTURE_REVIEW_URL}"]`).first();
		await expect(fixtureLink).toBeVisible();
	});

	test("should navigate to reading lists page", async ({ page }) => {
		await page.goto(localePath("/reading-lists"));

		// Page should load without errors
		await expect(page).toHaveURL(/\/en\/reading-lists/);
	});

	test("should show 404 page for invalid routes", async ({ page }) => {
		await page.goto("/this-page-does-not-exist-12345");

		// Should show 404 content (use first() in case multiple matches)
		const notFoundText = page.getByText(/not found|404|doesn't exist/i).first();
		await expect(notFoundText).toBeVisible();
	});

	// Navigates through the fixture review instead of "whatever card is first",
	// so the assertion does not depend on the order of the reviews page.
	test("should navigate from review card to review detail", async ({
		page,
	}) => {
		await page.goto(localePath("/reviews"));

		const fixtureLink = page.locator(`a[href="${FIXTURE_REVIEW_URL}"]`).first();
		await expect(fixtureLink).toBeVisible();
		await fixtureLink.click();

		// Should navigate to review detail page
		await expect(page).toHaveURL(new RegExp(FIXTURE_REVIEW_URL));

		// Should have review content (h1 title)
		await expect(
			page.getByRole("heading", { level: 1, name: E2E_FIXTURE_REVIEW.title }),
		).toBeVisible();
	});

	test("should have working dark mode toggle", async ({ page }) => {
		await page.goto(localePath("/"));

		const toggle = page.getByRole("button", { name: /toggle theme/i });
		await expect(toggle).toBeVisible();

		// The SSR'd trigger can be clicked before React hydrates; retry once
		await toggle.click();
		const darkOption = page.getByRole("menuitem", { name: /^dark$/i });
		const opened = await darkOption
			.isVisible({ timeout: 2000 })
			.catch(() => false);
		if (!opened) {
			await toggle.click();
		}
		await expect(darkOption).toBeVisible();
		await darkOption.click();

		// next-themes writes the resolved theme onto the html element
		await expect(page.locator("html")).toHaveClass(/dark/);
	});
});
