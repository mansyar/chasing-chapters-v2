import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEWS } from "../../src/lib/e2e-harness";
import {
	attentionBell,
	getReviewIdBySlug,
	loginAsFixtureAdmin,
} from "../fixtures/admin-session";

// The fixture seeds one failed and one stale review: the two states the
// attention bell has to surface.
const FAILED_REVIEW = E2E_FIXTURE_REVIEWS[2];
const STALE_REVIEW = E2E_FIXTURE_REVIEWS[3];

test.describe("Translation attention bell", () => {
	test("counts the reviews needing attention and links to their edit views", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		const bell = attentionBell(page);
		await expect(bell).toBeVisible();
		await expect(bell).toHaveAttribute(
			"aria-label",
			"translations needing attention: 2",
		);
		await expect(bell).toContainText("2");

		await bell.click();

		await expect(
			page.getByText("Translations needing attention"),
		).toBeVisible();

		const failedId = await getReviewIdBySlug(page, FAILED_REVIEW.slug);
		const staleId = await getReviewIdBySlug(page, STALE_REVIEW.slug);

		// The bell's entries link to the review's edit view. The link is
		// selected by its accessible name (the title and the status): the
		// admin panel links the same document elsewhere too.
		const failedLink = page.getByRole("link", {
			name: `${FAILED_REVIEW.title} failed`,
		});
		await expect(failedLink).toBeVisible();
		await expect(failedLink).toHaveAttribute(
			"href",
			`/admin/collections/reviews/${failedId}`,
		);

		const staleLink = page.getByRole("link", {
			name: `${STALE_REVIEW.title} stale`,
		});
		await expect(staleLink).toBeVisible();
		await expect(staleLink).toHaveAttribute(
			"href",
			`/admin/collections/reviews/${staleId}`,
		);

		// The entry leads to the review's edit view.
		await failedLink.click();
		await expect(page).toHaveURL(
			new RegExp(`/admin/collections/reviews/${failedId}`),
		);
	});
});
