import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_DRAFT_REVIEW,
	E2E_FIXTURE_READING_LIST_PATH,
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_SCHEDULED_REVIEW,
	E2E_FIXTURE_SCHEDULED_REVIEW_PATH,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

/**
 * The scheduled review is invisible on every public surface (`FR-5`, `AC-5`).
 *
 * The fixture seeds it as `published` and translated with a `publishAt` in
 * 2030, so it exercises the schedule and nothing else: if any of these cases
 * finds it, the gate is reading `_status` alone. Each case also checks a
 * visible review on the same surface, so a gate that simply hid everything
 * would fail too.
 */

const SCHEDULED_TITLE = E2E_FIXTURE_SCHEDULED_REVIEW.title;
const SCHEDULED_SLUG = E2E_FIXTURE_SCHEDULED_REVIEW.slug;

test.describe("Scheduled review visibility", () => {
	test("404s its own URL in both locales", async ({ page }) => {
		for (const locale of ["en", "id"] as const) {
			const response = await page.goto(
				localePath(E2E_FIXTURE_SCHEDULED_REVIEW_PATH, locale),
			);

			expect(response?.status()).toBe(404);
			await expect(page.getByText(SCHEDULED_TITLE)).toHaveCount(0);
		}
	});

	test("stays out of the public REST API", async ({ browser }) => {
		// The collection's anonymous read is the rule the public `/api` proxy
		// serves, so it is one more public surface (`FR-5`, `NFR-4`). A
		// signed-out context is what a reader has.
		const anonymous = await browser.newContext();

		try {
			const scheduledQuery = new URLSearchParams({
				"where[slug][equals]": SCHEDULED_SLUG,
				limit: "1",
			});
			const scheduled = await anonymous.request.get(
				`/api/reviews?${scheduledQuery.toString()}`,
			);

			expect(scheduled.status()).toBe(200);
			const scheduledBody = (await scheduled.json()) as {
				docs?: Array<{ slug?: string }>;
			};
			expect(scheduledBody.docs).toEqual([]);

			// The control: the same query for a visible review returns exactly
			// one document, so a rule that served nothing would fail too.
			const visibleQuery = new URLSearchParams({
				"where[slug][equals]": E2E_FIXTURE_REVIEW.slug,
				limit: "1",
			});
			const visible = await anonymous.request.get(
				`/api/reviews?${visibleQuery.toString()}`,
			);

			expect(visible.status()).toBe(200);
			const visibleBody = (await visible.json()) as {
				docs?: Array<{ slug?: string }>;
			};
			expect(visibleBody.docs).toHaveLength(1);
			expect(visibleBody.docs?.[0]?.slug).toBe(E2E_FIXTURE_REVIEW.slug);
		} finally {
			await anonymous.close();
		}
	});

	test("stays off the home page's latest reviews", async ({ page }) => {
		await page.goto(localePath("/", "en"));

		const reviewLinks = page.locator(`a[href*="/reviews/${SCHEDULED_SLUG}"]`);
		await expect(reviewLinks).toHaveCount(0);
		await expect(page.getByText(SCHEDULED_TITLE)).toHaveCount(0);
		// The control: the review the public specs navigate to is still there.
		await expect(
			page.locator(`a[href*="/reviews/${E2E_FIXTURE_REVIEW.slug}"]`).first(),
		).toBeVisible();
	});

	test("stays out of the browse list in both locales", async ({ page }) => {
		for (const locale of ["en", "id"] as const) {
			await page.goto(localePath("/reviews", locale));

			await expect(
				page.locator(`a[href*="/reviews/${SCHEDULED_SLUG}"]`),
			).toHaveCount(0);
			await expect(page.getByText(SCHEDULED_TITLE)).toHaveCount(0);
			await expect(
				page.locator(`a[href*="/reviews/${E2E_FIXTURE_REVIEW.slug}"]`).first(),
			).toBeVisible();
		}
	});

	test("shows no card for it on the fixture reading list", async ({ page }) => {
		// The fixture reading list holds every fixture review, the scheduled
		// one included, so the page itself has to filter it (`FR-5`).
		for (const locale of ["en", "id"] as const) {
			await page.goto(localePath(E2E_FIXTURE_READING_LIST_PATH, locale));

			await expect(page.getByText(SCHEDULED_TITLE)).toHaveCount(0);
			await expect(
				page.locator(`a[href*="/reviews/${SCHEDULED_SLUG}"]`),
			).toHaveCount(0);
			// The control: a visible review's card is on the same grid.
			await expect(
				page.locator(`a[href*="/reviews/${E2E_FIXTURE_REVIEW.slug}"]`).first(),
			).toBeVisible();
		}
	});

	test("stays out of both feeds", async ({ request }) => {
		for (const locale of ["en", "id"] as const) {
			const response = await request.get(`/${locale}/feed.xml`);

			expect(response.status()).toBe(200);
			const body = await response.text();
			expect(body).not.toContain(SCHEDULED_SLUG);
			expect(body).not.toContain("The Slow Orbit");
			expect(body).toContain(E2E_FIXTURE_REVIEW.slug);
		}
	});

	test("stays out of the sitemap", async ({ request }) => {
		const response = await request.get("/sitemap.xml");

		expect(response.status()).toBe(200);
		const body = await response.text();
		expect(body).not.toContain(`/reviews/${SCHEDULED_SLUG}`);
		// The never-published draft is not on the sitemap either, for the other
		// reason: it has never been published at all (`AC-2`).
		expect(body).not.toContain(`/reviews/${E2E_FIXTURE_DRAFT_REVIEW.slug}`);
		expect(body).toContain(`/reviews/${E2E_FIXTURE_REVIEW.slug}`);
	});

	test("serves no Open Graph image for it", async ({ request }) => {
		const response = await request.get(
			`/en${E2E_FIXTURE_SCHEDULED_REVIEW_PATH}/opengraph-image`,
		);

		expect(response.status()).toBe(404);
	});
});
