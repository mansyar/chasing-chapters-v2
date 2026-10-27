import { expect, type Page, test } from "@playwright/test";
import { formatDate } from "../src/lib/date-format";
import {
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEW_PATH,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_SCHEDULED_REVIEW_SLUG,
	E2E_FIXTURE_STALE_REVIEW_LOCALIZED,
} from "../src/lib/e2e-harness";
import { getDictionary } from "../src/lib/i18n/dictionary";
import { formatMessage } from "../src/lib/i18n/format";
import { localePath } from "./fixtures/locale";

const EN_URL = localePath(E2E_FIXTURE_REVIEW_PATH);
const ID_URL = localePath(E2E_FIXTURE_REVIEW_PATH, "id");

const EN_HEADING = getDictionary("en").relatedMoreLikeThis;
const EN_DESCRIPTION = getDictionary("en").relatedDescription;
const ID_HEADING = getDictionary("id").relatedMoreLikeThis;
const ID_DESCRIPTION = getDictionary("id").relatedDescription;

/**
 * The other fixture reviews the rail may show, in the order the scorer
 * produces: the seed gives every review the full taxonomy, so every pair
 * scores identically and the newest-then-slug tiebreak decides. The
 * scheduled review is never eligible and the current review never shows
 * itself, which mirrors the eligibility guards (`FR-5`).
 */
const ELIGIBLE_OTHERS = E2E_FIXTURE_REVIEWS.filter(
	(review) =>
		review.slug !== E2E_FIXTURE_REVIEW.slug && review.publishAt === undefined,
).sort((a, b) =>
	a.publishDate < b.publishDate
		? 1
		: a.publishDate > b.publishDate
			? -1
			: a.slug.localeCompare(b.slug),
);

/** The rail section, scoped by its translated heading. */
function railSection(page: Page, heading: string) {
	return page.locator("section", {
		has: page.getByRole("heading", { name: heading, level: 2 }),
	});
}

/**
 * The related-reviews rail end to end (`AC-1`, `AC-5`, `AC-7`, `AC-8`,
 * `AC-9`).
 *
 * The fixture seeds no `relatedReviews` picks, so the rail under test is the
 * affinity backfill in newest-first tiebreak order. Authored-pick priority
 * (`AC-2`) is pinned at the unit layer instead (`mergeRelatedReviews` in
 * Phase 1, pick flags and wiring in Phase 2): wiring picks into the shared
 * fixture would need a two-pass slug-to-id link plus a harness type change
 * for a suite that otherwise never touches the field. The hidden-when-empty
 * null path (`AC-1`) is likewise unit-pinned (`RelatedReviewsList` renders
 * nothing for no rows): every fixture page shares taxonomy, so no seeded
 * page yields zero candidates.
 */
test.describe("Related Reviews — desktop (EN)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EN_URL);
	});

	test("renders three rows in newest-first order, excluding self and scheduled", async ({
		page,
	}) => {
		const rail = railSection(page, EN_HEADING);
		await expect(
			rail.getByRole("heading", { level: 2, name: EN_HEADING }),
		).toBeVisible();
		await expect(rail).toContainText(EN_DESCRIPTION);

		const links = rail.getByRole("link");
		await expect(links).toHaveCount(3);

		const hrefs = await links.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute("href")),
		);
		expect(hrefs).toEqual(
			ELIGIBLE_OTHERS.map((review) => `/en/reviews/${review.slug}`),
		);

		for (const href of hrefs) {
			expect(href).not.toContain(E2E_FIXTURE_REVIEW.slug);
			expect(href).not.toContain(E2E_FIXTURE_SCHEDULED_REVIEW_SLUG);
		}
	});

	test("each row shows cover, title, rating, and publish date — no full cards", async ({
		page,
	}) => {
		const rail = railSection(page, EN_HEADING);
		const dictionary = getDictionary("en");

		for (const review of ELIGIBLE_OTHERS) {
			const row = rail.getByRole("listitem").filter({ hasText: review.title });
			await expect(row).toBeVisible();
			await expect(row.locator("img")).toBeVisible();

			const text = await row.evaluate((element) => element.textContent ?? "");
			expect(text).toContain(
				formatMessage(dictionary.ratingLabel, { rating: review.rating }),
			);
			expect(text).toContain(formatDate(review.publishDate, "en"));
		}

		await expect(rail.locator('[data-slot="card"]')).toHaveCount(0);
	});

	test("the rail sits below the article and above the comments", async ({
		page,
	}) => {
		const rail = railSection(page, EN_HEADING);
		await expect(rail).toBeVisible();

		const tops = await page.evaluate((heading: string) => {
			const topOf = (element: Element | null) =>
				element ? element.getBoundingClientRect().top + window.scrollY : -1;
			const railHeading = Array.from(
				document.querySelectorAll("section h2"),
			).find((element) => (element.textContent ?? "").includes(heading));
			const commentForm = Array.from(document.querySelectorAll("form")).find(
				(element) => /comment/i.test(element.textContent ?? ""),
			);
			return {
				article: topOf(document.querySelector("article h1")),
				rail: topOf(railHeading?.closest("section") ?? null),
				comments: topOf(commentForm ?? null),
			};
		}, EN_HEADING);

		expect(tops.article).toBeGreaterThanOrEqual(0);
		expect(tops.rail).toBeGreaterThan(tops.article);
		expect(tops.comments).toBeGreaterThan(tops.rail);
	});

	test("clicking a row navigates to that review", async ({ page }) => {
		const target = ELIGIBLE_OTHERS[0];
		if (!target) {
			throw new Error("The fixture has no related review to click.");
		}

		await railSection(page, EN_HEADING).getByRole("link").first().click();
		await page.waitForURL(new RegExp(`/reviews/${target.slug}$`));

		await expect(page.locator("h1").first()).toContainText(target.title);
	});
});

test.describe("Related Reviews — Indonesian", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ID_URL);
	});

	test("renders the translated heading with locale links in rail order", async ({
		page,
	}) => {
		const rail = railSection(page, ID_HEADING);
		await expect(
			rail.getByRole("heading", { level: 2, name: ID_HEADING }),
		).toBeVisible();
		await expect(rail).toContainText(ID_DESCRIPTION);

		const hrefs = await rail
			.getByRole("link")
			.evaluateAll((elements) =>
				elements.map((element) => element.getAttribute("href")),
			);
		expect(hrefs).toEqual(
			ELIGIBLE_OTHERS.map((review) => `/id/reviews/${review.slug}`),
		);
	});

	test("shows the localized title where one exists, English fallback elsewhere", async ({
		page,
	}) => {
		const rail = railSection(page, ID_HEADING);
		await expect(
			rail.getByRole("link", {
				name: new RegExp(E2E_FIXTURE_STALE_REVIEW_LOCALIZED.title),
			}),
		).toBeVisible();
		await expect(rail).toContainText("E2E Fixture: Salt and Paper Lanterns");
	});

	test("formats the row dates in Indonesian", async ({ page }) => {
		const rail = railSection(page, ID_HEADING);
		for (const review of ELIGIBLE_OTHERS) {
			await expect(rail).toContainText(formatDate(review.publishDate, "id"));
		}
	});
});

test.describe("Related Reviews — keyboard, targets, and semantics", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EN_URL);
	});

	test("keyboard users can traverse and activate the rail links", async ({
		page,
	}) => {
		const links = railSection(page, EN_HEADING).getByRole("link");
		const first = links.first();
		const second = links.nth(1);

		await first.focus();
		await expect(first).toBeFocused();

		await page.keyboard.press("Tab");
		await expect(second).toBeFocused();

		const href = await second.getAttribute("href");
		await page.keyboard.press("Enter");
		await page.waitForURL(new RegExp(`${href}$`));
	});

	test("every rail link meets the 44px touch target", async ({ page }) => {
		// Auto-retrying guard: the rail streams in after navigation, and
		// `evaluateAll` below takes a single immediate snapshot, so wait for
		// the three rows first instead of measuring a half-loaded section.
		const links = railSection(page, EN_HEADING).getByRole("link");
		await expect(links).toHaveCount(3);

		const heights = await links.evaluateAll((elements) =>
			elements.map((element) => element.getBoundingClientRect().height),
		);

		expect(heights).toHaveLength(3);
		for (const height of heights) {
			expect(height).toBeGreaterThanOrEqual(44);
		}
	});

	/**
	 * The repo has no axe runner (`@axe-core/playwright` is not installed,
	 * and `NFR-1` forbids new dependencies), so this is the manual pass that
	 * mirrors the axe rules the rail can break: heading, list semantics,
	 * link names, and image alts.
	 */
	test("the rail keeps heading, list, and naming semantics", async ({
		page,
	}) => {
		const rail = railSection(page, EN_HEADING);

		await expect(
			rail.getByRole("heading", { level: 2, name: EN_HEADING }),
		).toBeVisible();
		await expect(rail.getByRole("list")).toBeVisible();
		await expect(rail.getByRole("listitem")).toHaveCount(3);

		const names = await rail
			.getByRole("link")
			.evaluateAll((elements) =>
				elements.map(
					(element) =>
						element.getAttribute("aria-label") ?? element.textContent ?? "",
				),
			);
		for (const name of names) {
			expect(name.trim().length).toBeGreaterThan(0);
		}

		const alts = await rail
			.locator("img")
			.evaluateAll((elements) =>
				elements.map((element) => element.getAttribute("alt") ?? ""),
			);
		expect(alts).toHaveLength(3);
		for (const alt of alts) {
			expect(alt.trim().length).toBeGreaterThan(0);
		}
	});

	test("click-through works with reduced motion", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(EN_URL);

		const target = ELIGIBLE_OTHERS[0];
		if (!target) {
			throw new Error("The fixture has no related review to click.");
		}

		await railSection(page, EN_HEADING).getByRole("link").first().click();
		await page.waitForURL(new RegExp(`/reviews/${target.slug}$`));
	});
});

test.describe("Related Reviews — mobile", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test("rows stack with no horizontal overflow", async ({ page }) => {
		await page.goto(EN_URL);

		const rail = railSection(page, EN_HEADING);
		await expect(rail).toBeVisible();

		const tops = (await rail
			.getByRole("link")
			.evaluateAll((elements) =>
				elements.map((element) => element.getBoundingClientRect().top),
			)) as [number, number, number];

		expect(tops).toHaveLength(3);
		const [first, second, third] = tops;
		expect(second).toBeGreaterThan(first);
		expect(third).toBeGreaterThan(second);

		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
