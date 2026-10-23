import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEWS } from "../../src/lib/e2e-harness";
import {
	getReviewIdBySlug,
	loginAsFixtureAdmin,
} from "../fixtures/admin-session";

// The fixture's failed review is used: it is the review whose translation
// the admin has to redo.
const REVIEW = E2E_FIXTURE_REVIEWS[2];

test.describe("Translation status poller", () => {
	// The poller ticks every 20 seconds, so the spec has to outlast a tick.
	test.setTimeout(90_000);

	test("reports the finished translation and refreshes the visible status", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		const reviewId = await getReviewIdBySlug(page, REVIEW.slug);

		// Put the review in the state a running pipeline leaves behind, so
		// the poller has a transition to report.
		const marked = await page.request.patch(`/api/reviews/${reviewId}`, {
			data: { translationStatus: "pending" },
		});
		expect(marked.ok(), "could not mark the review pending").toBe(true);

		await page.goto(`/admin/collections/reviews/${reviewId}`);

		// The status is a read-only select: the chosen option is the visible
		// value of the field.
		const statusValue = page.locator(
			'#field-translationStatus [class*="single-value"]',
		);
		await expect(statusValue).toHaveText("pending");

		// Run the translation from outside the page: the form keeps showing
		// the pending status, so the poller sees the transition itself.
		const run = await page.request.post(`/api/reviews/${reviewId}/retranslate`);
		expect(run.ok()).toBe(true);
		const runBody = (await run.json()) as { translationStatus?: string };
		expect(runBody.translationStatus).toBe("translated");

		// The poller picks the new status up on its next tick and toasts it.
		await expect(page.getByText("Translation completed")).toBeVisible({
			timeout: 45_000,
		});
		await expect(statusValue).toHaveText("translated");

		// The translation really happened: the Indonesian locale carries the
		// offline stub's marker instead of the English source text.
		const localized = await page.request.get(
			`/api/reviews/${reviewId}?locale=id&depth=0`,
		);
		expect(localized.ok()).toBe(true);
		const localizedBody = (await localized.json()) as {
			reviewContent?: unknown;
		};
		expect(JSON.stringify(localizedBody.reviewContent)).toContain("[stub-id]");
	});
});
