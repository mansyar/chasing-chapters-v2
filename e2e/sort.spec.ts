import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEW_PATH,
} from "../src/lib/e2e-harness";

test.describe("Reviews sorting", () => {
	test("should show the sort dropdown with default selection", async ({
		page,
	}) => {
		await page.goto("/reviews");

		const trigger = page.getByRole("combobox", { name: /sort by/i });
		await expect(trigger).toBeVisible();
		await expect(trigger).toContainText(/Most Recent/i);
	});

	test("should apply the selected sort via URL param", async ({ page }) => {
		await page.goto("/reviews");

		const trigger = page.getByRole("combobox", { name: /sort by/i });
		await trigger.click();

		// The SSR'd trigger can be clicked before React hydrates; retry once
		const option = page.getByRole("option", { name: /Highest Rated/i });
		const opened = await option.isVisible({ timeout: 2000 }).catch(() => false);
		if (!opened) {
			await trigger.click();
		}
		await option.click();

		await expect(page).toHaveURL(/sort=rating/);
		await expect(
			page.getByRole("combobox", { name: /sort by/i }),
		).toContainText(/Highest Rated/i);
	});

	test("should keep the sort selection across reload", async ({ page }) => {
		await page.goto("/reviews?sort=title");

		await expect(page).toHaveURL(/sort=title/);
		await expect(
			page.getByRole("combobox", { name: /sort by/i }),
		).toContainText(/Title A–Z/i);
	});

	test("should keep the fixture review in the list for every sort", async ({
		page,
	}) => {
		for (const sort of ["recent", "rating", "title"]) {
			await page.goto(`/reviews?sort=${sort}`);

			await expect(
				page.locator(`a[href="${E2E_FIXTURE_REVIEW_PATH}"]`).first(),
			).toBeVisible();
		}
	});

	test("should fall back to recent for invalid sort values", async ({
		page,
	}) => {
		await page.goto("/reviews?sort=bogus");

		await expect(
			page.getByRole("combobox", { name: /sort by/i }),
		).toContainText(/Most Recent/i);
		// Review list still renders
		const heading = page.getByRole("heading", { name: /All Reviews/i });
		await expect(heading).toBeVisible();
		await expect(
			page.getByText(E2E_FIXTURE_REVIEW.title).first(),
		).toBeVisible();
	});
});
