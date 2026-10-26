import { expect, type Page, test } from "@playwright/test";
import { localePath } from "./fixtures/locale";

/**
 * Route error boundaries (`FR-5`, `AC-1`, `AC-2`, `AC-6`).
 *
 * The `/boom` page is test-only: no production UI links to it, the sitemap
 * never lists it, and it carries a noindex robots rule. Its button throws
 * during render on click, which is what the `[locale]/error.tsx` segment
 * boundary catches. The throw is state-driven so `reset()` recovers to the
 * button instead of the error UI.
 */

const TRIGGER_BUTTON = "Throw test error";
const THROWN_MESSAGE = "E2E forced error";

// Next renders its own route announcer with role="alert" at the body level,
// so the branded error UI is scoped to the segment's <main> to stay strict.
function errorRegion(page: Page) {
	return page.locator('main [role="alert"]');
}

async function triggerSegmentError(page: Page) {
	await page.getByRole("button", { name: TRIGGER_BUTTON }).click();
}

test.describe("Route error boundaries", () => {
	test("shows the branded English error UI and recovers via Try Again", async ({
		page,
	}) => {
		await page.goto(localePath("/boom", "en"));

		await triggerSegmentError(page);

		// The branded English UI, announced as an alert.
		await expect(errorRegion(page)).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "This Chapter Stumbled" }),
		).toBeVisible();
		await expect(
			page.getByText("your place in the story is safe", { exact: false }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();
		const homeLink = page.getByRole("link", { name: "Back Home" });
		await expect(homeLink).toBeVisible();
		await expect(homeLink).toHaveAttribute("href", "/en");

		// No internals leak into the rendered page.
		const body = page.locator("body");
		await expect(body).not.toContainText(THROWN_MESSAGE);
		await expect(body).not.toContainText("digest");
		await expect(body).not.toContainText("Call Stack");

		// Try Again resets the segment back to the trigger page.
		await page.getByRole("button", { name: "Try Again" }).click();
		await expect(
			page.getByRole("button", { name: TRIGGER_BUTTON }),
		).toBeVisible();
		await expect(errorRegion(page)).toHaveCount(0);
	});

	test("navigates home from the English error UI", async ({ page }) => {
		await page.goto(localePath("/boom", "en"));

		await triggerSegmentError(page);
		await page.getByRole("link", { name: "Back Home" }).click();

		await expect(page).toHaveURL(/\/en\/?$/);
		await expect(
			page.getByRole("heading", { name: /Latest Reviews/i }),
		).toBeVisible();
	});

	test("shows the branded Indonesian error UI and recovers via Try Again", async ({
		page,
	}) => {
		await page.goto(localePath("/boom", "id"));

		await triggerSegmentError(page);

		// The same UI in Indonesian.
		await expect(errorRegion(page)).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "Bab Ini Tersandung" }),
		).toBeVisible();
		await expect(
			page.getByText("tempat Anda dalam cerita tetap aman", { exact: false }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Coba Lagi" })).toBeVisible();
		const homeLink = page.getByRole("link", { name: "Kembali ke Beranda" });
		await expect(homeLink).toBeVisible();
		await expect(homeLink).toHaveAttribute("href", "/id");

		// No internals leak into the rendered page.
		const body = page.locator("body");
		await expect(body).not.toContainText(THROWN_MESSAGE);
		await expect(body).not.toContainText("digest");
		await expect(body).not.toContainText("Call Stack");

		// Try Again resets the segment back to the trigger page.
		await page.getByRole("button", { name: "Coba Lagi" }).click();
		await expect(
			page.getByRole("button", { name: TRIGGER_BUTTON }),
		).toBeVisible();
		await expect(errorRegion(page)).toHaveCount(0);
	});

	test("navigates home from the Indonesian error UI", async ({ page }) => {
		await page.goto(localePath("/boom", "id"));

		await triggerSegmentError(page);
		await page.getByRole("link", { name: "Kembali ke Beranda" }).click();

		await expect(page).toHaveURL(/\/id\/?$/);
		await expect(
			page.getByRole("heading", { name: /Daftar Bacaan Pilihan/i }),
		).toBeVisible();
	});
});
