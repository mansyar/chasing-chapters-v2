import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_SCHEDULED_REVIEW,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

/**
 * Locale correctness of the document, its metadata, the sitemap and the feeds
 * (`FR-5`, `FR-6`, `FR-8`, `FR-9`, `AC-5`, `AC-6`, `AC-8`).
 *
 * The fixture set is asserted by slug, not by "whatever the database returned":
 * three reviews carry Indonesian content, one is `failed` and one is `stale`,
 * and every one of them is published. The fifth is published too but scheduled,
 * so it belongs in neither locale of the sitemap - its absence is asserted
 * alongside the others' presence.
 */

const REVIEW_PATH = `/reviews/${E2E_FIXTURE_REVIEW.slug}`;

/** The fixture slugs that are public: every review except the scheduled one. */
const VISIBLE_FIXTURE_SLUGS = E2E_FIXTURE_REVIEWS.filter(
	(review) => review.publishAt === undefined,
).map((review) => review.slug);

function escapeXmlTitle(title: string): string {
	return title.replaceAll("'", "&apos;");
}

test.describe("Locale metadata", () => {
	test("declares the document language per locale", async ({ page }) => {
		await page.goto(localePath("/", "en"));
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page).toHaveTitle(
			"Book Reviews and Reading Lists | Chasing Chapters",
		);

		await page.goto(localePath("/", "id"));
		await expect(page.locator("html")).toHaveAttribute("lang", "id");
		await expect(page).toHaveTitle(
			"Ulasan Buku dan Daftar Bacaan | Chasing Chapters",
		);
	});

	test("keeps the browse page's alternates on the path, not the query", async ({
		page,
	}) => {
		await page.goto(`${localePath("/reviews", "en")}?sort=rating`);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			"https://chasing-chapters.com/en/reviews",
		);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"en_US",
		);

		await page.goto(localePath("/reviews", "id"));
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			"https://chasing-chapters.com/id/reviews",
		);
		await expect(
			page.locator('link[rel="alternate"][hreflang="x-default"]'),
		).toHaveAttribute("href", "https://chasing-chapters.com/en/reviews");
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"id_ID",
		);
	});

	test("localizes the static About page", async ({ page }) => {
		await page.goto(localePath("/about", "en"));
		await expect(page).toHaveTitle("About | Chasing Chapters");
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			"https://chasing-chapters.com/en/about",
		);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"en_US",
		);

		await page.goto(localePath("/about", "id"));
		await expect(page).toHaveTitle("Tentang | Chasing Chapters");
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			"https://chasing-chapters.com/id/about",
		);
		await expect(
			page.locator('link[rel="alternate"][hreflang="en"]'),
		).toHaveAttribute("href", "https://chasing-chapters.com/en/about");
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"id_ID",
		);
	});

	test("canonicalizes each review page to its own locale", async ({ page }) => {
		await page.goto(localePath(REVIEW_PATH, "en"));
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			new RegExp(`/en/reviews/${E2E_FIXTURE_REVIEW.slug}$`),
		);

		await page.goto(localePath(REVIEW_PATH, "id"));
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			new RegExp(`/id/reviews/${E2E_FIXTURE_REVIEW.slug}$`),
		);
	});

	test("describes the Indonesian review page in Indonesian", async ({
		page,
	}) => {
		await page.goto(localePath(REVIEW_PATH, "id"));

		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			"content",
			`Baca ulasan ${E2E_FIXTURE_REVIEW.title} karya ${E2E_FIXTURE_REVIEW.bookAuthor}. Rating: ${E2E_FIXTURE_REVIEW.rating}/5 bintang.`,
		);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"id_ID",
		);
		await expect(
			page.locator('meta[property="og:locale:alternate"]'),
		).toHaveAttribute("content", "en_US");
	});

	test("describes the English review page in English", async ({ page }) => {
		await page.goto(localePath(REVIEW_PATH, "en"));

		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			"content",
			`Read our review of ${E2E_FIXTURE_REVIEW.title} by ${E2E_FIXTURE_REVIEW.bookAuthor}. Rating: ${E2E_FIXTURE_REVIEW.rating}/5 stars.`,
		);
		await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
			"content",
			"en_US",
		);
	});

	test("emits reciprocal hreflang alternates from both locales", async ({
		page,
	}) => {
		const expected = {
			en: new RegExp(`/en/reviews/${E2E_FIXTURE_REVIEW.slug}$`),
			id: new RegExp(`/id/reviews/${E2E_FIXTURE_REVIEW.slug}$`),
		};

		for (const locale of ["en", "id"] as const) {
			await page.goto(localePath(REVIEW_PATH, locale));

			await expect(
				page.locator('link[rel="alternate"][hreflang="en"]'),
			).toHaveAttribute("href", expected.en);
			await expect(
				page.locator('link[rel="alternate"][hreflang="id"]'),
			).toHaveAttribute("href", expected.id);
			// `x-default` is English, the locale the bare paths resolve to.
			await expect(
				page.locator('link[rel="alternate"][hreflang="x-default"]'),
			).toHaveAttribute("href", expected.en);
		}
	});

	test("advertises the locale's own feed in the document", async ({ page }) => {
		await page.goto(localePath(REVIEW_PATH, "id"));

		await expect(
			page.locator('link[rel="alternate"][type="application/rss+xml"]'),
		).toHaveAttribute("href", /\/id\/feed\.xml$/);
		await expect(
			page.getByRole("contentinfo").getByRole("link", { name: /rss/i }),
		).toHaveAttribute("href", "/id/feed.xml");
	});
});

test.describe("Feeds", () => {
	test("redirects the pre-locale feed to English permanently", async ({
		request,
	}) => {
		const response = await request.get("/feed.xml", { maxRedirects: 0 });

		expect(response.status()).toBe(308);
		expect(response.headers().location).toMatch(/\/en\/feed\.xml$/);
	});

	test("serves the English feed", async ({ request }) => {
		const response = await request.get("/en/feed.xml");

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/rss+xml");

		const body = await response.text();
		expect(body).toContain("<language>en</language>");
		expect(body).toContain(`/en/reviews/${E2E_FIXTURE_REVIEW.slug}`);
		expect(body).toContain(
			`<title>${escapeXmlTitle(E2E_FIXTURE_REVIEW.title)}</title>`,
		);
	});

	test("serves the Indonesian feed with Indonesian item text", async ({
		request,
	}) => {
		const response = await request.get("/id/feed.xml");

		expect(response.status()).toBe(200);

		const body = await response.text();
		expect(body).toContain("<language>id</language>");
		expect(body).toContain(
			'<atom:link href="https://chasing-chapters.com/id/feed.xml" rel="self"',
		);
		expect(body).toContain(`/id/reviews/${E2E_FIXTURE_REVIEW.slug}`);
		// The fixture's Indonesian body, not the English one it was translated from.
		expect(body).toContain("Buku Almanak Penjaga Mercusuar karya");
		expect(body).not.toContain("<language>en</language>");
	});
});

test.describe("Sitemap", () => {
	test("lists every fixture review in both locales with hreflang", async ({
		request,
	}) => {
		const response = await request.get("/sitemap.xml");

		expect(response.status()).toBe(200);

		const body = await response.text();
		for (const slug of VISIBLE_FIXTURE_SLUGS) {
			expect(body).toContain(`/en/reviews/${slug}</loc>`);
			expect(body).toContain(`/id/reviews/${slug}</loc>`);
			expect(body).toContain(
				`hreflang="en" href="https://chasing-chapters.com/en/reviews/${slug}"`,
			);
			expect(body).toContain(
				`hreflang="id" href="https://chasing-chapters.com/id/reviews/${slug}"`,
			);
			expect(body).toContain(
				`hreflang="x-default" href="https://chasing-chapters.com/en/reviews/${slug}"`,
			);
		}

		// The scheduled review is published but not public, so neither of its
		// URLs may appear - a sitemap entry is an invitation to crawl.
		const scheduledSlug = E2E_FIXTURE_SCHEDULED_REVIEW.slug;
		expect(body).not.toContain(`/en/reviews/${scheduledSlug}</loc>`);
		expect(body).not.toContain(`/id/reviews/${scheduledSlug}</loc>`);
		expect(body).not.toContain(`/reviews/${scheduledSlug}"`);
	});

	test("lists both locales of the static pages and the reading list", async ({
		request,
	}) => {
		const response = await request.get("/sitemap.xml");
		const body = await response.text();

		for (const path of [
			"/en",
			"/id",
			"/en/about",
			"/id/about",
			"/en/reviews",
			"/id/reviews",
			"/en/reading-lists",
			"/id/reading-lists",
		]) {
			expect(body).toContain(`<loc>https://chasing-chapters.com${path}</loc>`);
		}

		const listSlug = E2E_FIXTURE_READING_LIST.slug;
		expect(body).toContain(`/en/reading-lists/${listSlug}</loc>`);
		expect(body).toContain(`/id/reading-lists/${listSlug}</loc>`);
	});
});
