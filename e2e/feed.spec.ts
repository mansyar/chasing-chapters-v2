import { expect, test } from "@playwright/test";

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

	test("should include published reviews as items", async ({ request }) => {
		const response = await request.get("/feed.xml");
		const body = await response.text();

		// The fixture review is the only published review in the dev database
		expect(body).toContain("<item>");
		expect(body).toContain("<title>The Fixture: A Test Review</title>");
		expect(body).toContain("/reviews/");
		expect(body).toContain("<pubDate>");
	});

	test("should expose feed discovery in the page head", async ({ page }) => {
		await page.goto("/");

		const discoveryLink = page.locator(
			'link[rel="alternate"][type="application/rss+xml"]',
		);
		await expect(discoveryLink).toHaveCount(1);
		await expect(discoveryLink).toHaveAttribute("href", /\/feed\.xml$/);
	});

	test("should link the feed from the site footer", async ({ page }) => {
		await page.goto("/");

		const footerLink = page
			.getByRole("contentinfo")
			.getByRole("link", { name: /rss/i });
		await expect(footerLink).toBeVisible();
		await expect(footerLink).toHaveAttribute("href", "/feed.xml");
	});
});
