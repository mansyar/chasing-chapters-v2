import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEW } from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

test.describe("RSS Feed", () => {
	test("should serve a valid RSS 2.0 document", async ({ request }) => {
		const response = await request.get("/feed.xml");

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/rss+xml");

		const body = await response.text();
		expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		expect(body).toContain('<rss version="2.0"');
		expect(body).toContain("<channel>");
		expect(body).toContain("<title>Chasing Chapters</title>");
		expect(body).toContain("<language>en</language>");
	});

	test("should include the fixture review as an item", async ({ request }) => {
		const response = await request.get("/feed.xml");
		const body = await response.text();

		// The fixture review is published, so the feed has to list it. XML
		// escapes the apostrophe in the title.
		const escapedTitle = E2E_FIXTURE_REVIEW.title.replaceAll("'", "&apos;");
		expect(body).toContain("<item>");
		expect(body).toContain(`<title>${escapedTitle}</title>`);
		expect(body).toContain(`/reviews/${E2E_FIXTURE_REVIEW.slug}`);
		expect(body).toContain("<pubDate>");
	});

	test("should expose feed discovery in the page head", async ({ page }) => {
		await page.goto(localePath("/"));

		const discoveryLink = page.locator(
			'link[rel="alternate"][type="application/rss+xml"]',
		);
		await expect(discoveryLink).toHaveCount(1);
		await expect(discoveryLink).toHaveAttribute("href", /\/en\/feed\.xml$/);
	});

	test("should link the locale's feed from the site footer", async ({
		page,
	}) => {
		await page.goto(localePath("/"));

		const footerLink = page
			.getByRole("contentinfo")
			.getByRole("link", { name: /rss/i });
		await expect(footerLink).toBeVisible();
		await expect(footerLink).toHaveAttribute("href", "/en/feed.xml");
	});
});
