import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEWS } from "../../src/lib/e2e-harness";
import {
	escapeRegExp,
	getReviewIdBySlug,
	loginAsFixtureAdmin,
	REVIEWS_ADMIN_PATH,
} from "../fixtures/admin-session";

// The fixture seeds one failed and one stale review: exactly the two states
// the bulk action can act on.
const FAILED_REVIEW = E2E_FIXTURE_REVIEWS[2];
const STALE_REVIEW = E2E_FIXTURE_REVIEWS[3];

test.describe("Bulk re-translate action", () => {
	test("lists the candidates, runs the selection and reports every outcome", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);
		await page.goto(REVIEWS_ADMIN_PATH);

		await page
			.getByRole("button", { name: "Bulk re-translate reviews" })
			.click();

		await expect(
			page.getByText("Re-translate failed and stale reviews"),
		).toBeVisible();

		const failedId = await getReviewIdBySlug(page, FAILED_REVIEW.slug);
		const staleId = await getReviewIdBySlug(page, STALE_REVIEW.slug);

		// The candidate list holds the failed and the stale fixture review.
		const failedCheckbox = page.getByRole("checkbox", {
			name: new RegExp(escapeRegExp(FAILED_REVIEW.title)),
		});
		await expect(failedCheckbox).toBeVisible();
		const failedCandidate = page.locator("li").filter({ has: failedCheckbox });
		await expect(failedCandidate).toContainText("failed");

		const staleCheckbox = page.getByRole("checkbox", {
			name: new RegExp(escapeRegExp(STALE_REVIEW.title)),
		});
		await expect(staleCheckbox).toBeVisible();
		const staleCandidate = page.locator("li").filter({ has: staleCheckbox });
		await expect(staleCandidate).toContainText("stale");

		await expect(page.getByText("0 of 2 selected")).toBeVisible();

		// Select both candidates and run the bulk re-translate.
		await page.getByRole("button", { name: "Select all" }).click();
		await expect(page.getByText("2 of 2 selected")).toBeVisible();
		await page.getByRole("button", { name: "Re-translate 2 reviews" }).click();

		// The run reports one outcome row per review.
		await expect(
			page.getByText("2 reviews: 2 translated").first(),
		).toBeVisible();
		await expect(
			page.getByText(`Review ${failedId}: translated`, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(`Review ${staleId}: translated`, { exact: true }),
		).toBeVisible();
	});
});
