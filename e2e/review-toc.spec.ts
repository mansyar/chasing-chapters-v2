import { expect, type Page, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEW_PATH } from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

const EN_URL = localePath(E2E_FIXTURE_REVIEW_PATH);
const ID_URL = localePath(E2E_FIXTURE_REVIEW_PATH, "id");

/** The TOC navigation for a locale. */
function tocNav(page: Page, name: string) {
	return page.getByRole("navigation", { name });
}

/**
 * TOC, anchors, and quote-share on the review detail page.
 *
 * The fixture review carries the three structured sections plus a
 * favorite quote and no body headings, so the TOC lists the section
 * entries: enough to prove navigation, deep-links, and clipboard
 * in both locales (`FR-1`, `FR-3`, `FR-4`, `FR-6`, `FR-7`).
 */
test.describe("Review TOC — desktop (EN)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(EN_URL);
	});

	test("renders the sticky TOC and reading-time", async ({ page }) => {
		const nav = tocNav(page, "On this page");
		await expect(nav).toBeVisible();
		await expect(page.locator("aside.sticky")).toBeVisible();

		const links = nav.getByRole("link");
		const count = await links.count();
		expect(count).toBeGreaterThanOrEqual(2);
		await expect(links.first()).toBeVisible();

		await expect(page.getByText(/min read/)).toBeVisible();
	});

	test("a TOC link scrolls and updates the hash", async ({ page }) => {
		const nav = tocNav(page, "On this page");
		const firstLink = nav.getByRole("link").first();
		const href = (await firstLink.getAttribute("href")) ?? "";

		expect(href.startsWith("#")).toBe(true);

		await firstLink.click();
		expect(page.url()).toContain(href);
		await expect(firstLink).toHaveAttribute("aria-current", "location");
		await expect(page.locator(`#${href.slice(1)}`)).toBeVisible();
	});

	test("scrolling the article updates the active TOC link", async ({
		page,
	}) => {
		const nav = tocNav(page, "On this page");
		const lastLink = nav.getByRole("link").last();
		const href = (await lastLink.getAttribute("href")) ?? "";

		expect(href.startsWith("#")).toBe(true);

		// Scroll-driven (no click): the scroll-position handler owns the active link here.
		await page.locator(`#${href.slice(1)}`).scrollIntoViewIfNeeded();
		await expect(lastLink).toHaveAttribute("aria-current", "location");
	});

	test("deep-links land on the anchored heading", async ({ page }) => {
		const nav = tocNav(page, "On this page");
		const firstLink = nav.getByRole("link").first();
		const href = (await firstLink.getAttribute("href")) ?? "";

		await page.goto(`${EN_URL}${href}`);
		await expect(page.locator(`#${href.slice(1)}`)).toBeVisible();
		expect(page.url()).toContain(href);
	});

	test("copy-link writes the anchor URL", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const copyButton = page.getByRole("button", { name: "Copy link" });
		await copyButton.first().click();

		// The toast only fires after the clipboard write resolves.
		await expect(page.getByText("Link copied to clipboard")).toBeVisible();
		expect(page.url()).toContain("#");
	});

	test("quote copy toasts success", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const copyButton = page.getByRole("button", { name: "Copy quote" });
		await copyButton.first().click();

		await expect(page.getByText("Link copied to clipboard")).toBeVisible();
		await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
	});

	test("TOC works with reduced motion", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		const nav = tocNav(page, "On this page");
		const firstLink = nav.getByRole("link").first();

		await firstLink.click();
		expect(page.url()).toContain("#");
		await expect(firstLink).toHaveAttribute("aria-current", "location");
	});
});

test.describe("Review TOC — mobile", () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test.beforeEach(async ({ page }) => {
		await page.goto(EN_URL);
	});

	test("the collapsible TOC expands", async ({ page }) => {
		const summary = page.locator("summary", { hasText: "On this page" });
		await expect(summary).toBeVisible();
		await summary.click();

		const nav = tocNav(page, "On this page");
		await expect(nav).toBeVisible();

		const count = await nav.getByRole("link").count();
		expect(count).toBeGreaterThanOrEqual(2);
	});

	test("the toggle is keyboard-operable", async ({ page }) => {
		const summary = page.locator("summary", { hasText: "On this page" });
		await summary.focus();
		await page.keyboard.press("Enter");

		const nav = tocNav(page, "On this page");
		await expect(nav).toBeVisible();
	});
});

test.describe("Review TOC — Indonesian", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(ID_URL);
	});

	test("renders translated TOC and reading-time", async ({ page }) => {
		const nav = tocNav(page, "Di halaman ini");
		await expect(nav).toBeVisible();

		const count = await nav.getByRole("link").count();
		expect(count).toBeGreaterThanOrEqual(2);

		await expect(page.getByText(/mnt baca/)).toBeVisible();

		const loved = page.getByRole("heading", { name: "Yang Saya Sukai" });
		await expect(loved).toBeVisible();

		await expect(
			page.getByRole("button", { name: "Salin kutipan" }),
		).toBeVisible();
	});

	test("copy-link toast is translated", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		const copyButton = page.getByRole("button", { name: "Salin tautan" });
		await copyButton.first().click();

		await expect(page.getByText("Tautan disalin ke papan klip")).toBeVisible();
	});
});
