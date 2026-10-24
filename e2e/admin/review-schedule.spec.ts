import { expect, type Page, test } from "@playwright/test";
import {
	E2E_FIXTURE_DRAFT_REVIEW,
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_SCHEDULED_REVIEW,
} from "../../src/lib/e2e-harness";
import {
	getReviewIdBySlug,
	loginAsFixtureAdmin,
	REVIEWS_ADMIN_PATH,
} from "../fixtures/admin-session";

/**
 * What the admin says about a review's schedule (`FR-7`, `AC-7`).
 *
 * The unit tests prove the derivation; these cases prove the two surfaces are
 * really wired into the panel and say the same thing an author would read.
 * They run in their own chained admin project, because they share the fixture
 * admin session with the other admin specs.
 */

const SCHEDULED_TITLE = E2E_FIXTURE_SCHEDULED_REVIEW.title;
const SCHEDULED_SLUG = E2E_FIXTURE_SCHEDULED_REVIEW.slug;
const LIVE_TITLE = E2E_FIXTURE_REVIEW.title;
const LIVE_SLUG = E2E_FIXTURE_REVIEW.slug;
const DRAFT_TITLE = E2E_FIXTURE_DRAFT_REVIEW.title;
const DRAFT_SLUG = E2E_FIXTURE_DRAFT_REVIEW.slug;

/** The sentence the edit view must show for the fixture's scheduled review. */
const SCHEDULED_NOTICE = "Scheduled to publish on 1 January 2030 at 00:00 UTC.";

/** The sentence the edit view must show for a review that is already out. */
const LIVE_NOTICE = "Live. Readers can see this review now.";

/** The table row of the review with this title. */
function reviewRow(page: Page, title: string) {
	return page.locator("tr", { hasText: title });
}

test.describe("Review schedule in the admin", () => {
	test.describe.configure({ mode: "serial" });
	// A login plus the review edit views: the admin panel is slow to hydrate
	// on a cold server, so the same room as the other admin specs.
	test.setTimeout(120_000);

	test("tells a scheduled review from a live one in the list", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);
		await page.goto(REVIEWS_ADMIN_PATH);

		// The schedule column exists because the collection lists it, and the
		// three states are readable without opening a document.
		await expect(
			page.getByRole("columnheader", { name: "Publish At" }),
		).toBeVisible();

		await expect(reviewRow(page, SCHEDULED_TITLE)).toContainText("Scheduled");
		await expect(reviewRow(page, LIVE_TITLE)).toContainText("Live");
		// The never-published draft is not scheduled and not live, and the
		// cell must not quietly call it either.
		await expect(reviewRow(page, DRAFT_TITLE)).toContainText("Draft");
		await expect(reviewRow(page, DRAFT_TITLE)).not.toContainText("Scheduled");
		await expect(reviewRow(page, DRAFT_TITLE)).not.toContainText("Live");
	});

	test("states when a review will publish in the edit view", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		const scheduledId = await getReviewIdBySlug(page, SCHEDULED_SLUG);
		await page.goto(`${REVIEWS_ADMIN_PATH}/${scheduledId}`);
		await expect(page.getByText(SCHEDULED_NOTICE)).toBeVisible();

		// A review with no schedule is already out, and the notice says so
		// rather than staying silent.
		const liveId = await getReviewIdBySlug(page, LIVE_SLUG);
		await page.goto(`${REVIEWS_ADMIN_PATH}/${liveId}`);
		await expect(page.getByText(LIVE_NOTICE)).toBeVisible();
		await expect(page.getByText(SCHEDULED_NOTICE)).toHaveCount(0);

		// A draft says neither: it has not published and has nothing scheduled.
		const draftId = await getReviewIdBySlug(page, DRAFT_SLUG);
		await page.goto(`${REVIEWS_ADMIN_PATH}/${draftId}`);
		await expect(
			page.getByRole("heading", { name: new RegExp(DRAFT_TITLE) }),
		).toBeVisible();
		await expect(page.getByText(/Scheduled to publish on/)).toHaveCount(0);
		await expect(page.getByText(LIVE_NOTICE)).toHaveCount(0);
	});

	test("stops promising a schedule the author cleared without saving", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		const scheduledId = await getReviewIdBySlug(page, SCHEDULED_SLUG);
		await page.goto(`${REVIEWS_ADMIN_PATH}/${scheduledId}`);
		await expect(page.getByText(SCHEDULED_NOTICE)).toBeVisible();

		// Clearing the date writes `null` into the form without saving, so the
		// notice has to follow the form rather than keep reading the saved
		// document (`F4`). Nothing is submitted here: the saved schedule and
		// every other case in this file must be unaffected.
		//
		// The scheduled notice is server-rendered from the saved document, so it
		// (and the clear button in that markup) is visible before the picker's
		// React handlers are attached; a single click can land on inert markup
		// and leave the form untouched. Click until the field actually empties,
		// and prove the emptiness before asserting on the notice.
		const scheduleInput = page.locator("#field-publishAt input").first();

		await expect(async () => {
			await page
				.locator("#field-publishAt .date-time-picker__clear-button")
				.click();
			await expect(scheduleInput).toHaveValue("", { timeout: 1_000 });
		}).toPass();

		await expect(page.getByText(LIVE_NOTICE)).toBeVisible();
		await expect(page.getByText(SCHEDULED_NOTICE)).toHaveCount(0);
	});
});
