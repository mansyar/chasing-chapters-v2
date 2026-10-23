import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEW, resolveE2EBaseURL } from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

const BASE_URL = resolveE2EBaseURL(process.env);
const FIXTURE_REVIEW_PATH = `/reviews/${E2E_FIXTURE_REVIEW.slug}`;

// The proxy answers with a path-only `Location`, so resolve it against the
// server the suite runs against.
function redirectUrl(location: string | undefined): URL {
	if (!location) {
		throw new Error("The response carried no Location header.");
	}

	return new URL(location, BASE_URL);
}

function pathnameOf(location: string | undefined): string | null {
	return location ? redirectUrl(location).pathname : null;
}

test.describe("Locale routing", () => {
	test("serves both locales", async ({ request }) => {
		for (const locale of ["en", "id"] as const) {
			const response = await request.get(localePath("/", locale));

			expect(response.status()).toBe(200);
			expect(await response.text()).toContain("Chasing Chapters");
		}
	});

	test("redirects the root to the default locale", async ({ request }) => {
		const response = await request.get("/", { maxRedirects: 0 });

		expect(response.status()).toBe(307);
		expect(pathnameOf(response.headers().location)).toBe("/en");
	});

	test("redirects a bare public path to the default locale", async ({
		request,
	}) => {
		const response = await request.get("/reviews", { maxRedirects: 0 });

		expect(response.status()).toBe(307);
		expect(pathnameOf(response.headers().location)).toBe("/en/reviews");
	});

	test("remembers the chosen locale from the cookie", async ({ request }) => {
		const response = await request.get("/reviews", {
			maxRedirects: 0,
			headers: { cookie: "NEXT_LOCALE=id" },
		});

		expect(response.status()).toBe(307);
		expect(pathnameOf(response.headers().location)).toBe("/id/reviews");
	});

	test("falls back to English for an unusable remembered locale", async ({
		request,
	}) => {
		const response = await request.get("/reading-lists", {
			maxRedirects: 0,
			headers: { cookie: "NEXT_LOCALE=klingon" },
		});

		expect(response.status()).toBe(307);
		expect(pathnameOf(response.headers().location)).toBe("/en/reading-lists");
	});

	test("keeps the query string when adding the locale", async ({ request }) => {
		const response = await request.get("/reviews?sort=title&page=2", {
			maxRedirects: 0,
		});

		const location = redirectUrl(response.headers().location);

		expect(response.status()).toBe(307);
		expect(location.pathname).toBe("/en/reviews");
		expect(location.searchParams.get("sort")).toBe("title");
		expect(location.searchParams.get("page")).toBe("2");
	});

	test("permanently redirects a legacy locale parameter to the path form", async ({
		request,
	}) => {
		const response = await request.get(
			`/en${FIXTURE_REVIEW_PATH}?locale=id&sort=title`,
			{ maxRedirects: 0 },
		);

		const location = redirectUrl(response.headers().location);

		expect(response.status()).toBe(308);
		expect(location.pathname).toBe(`/id${FIXTURE_REVIEW_PATH}`);
		expect(location.searchParams.get("sort")).toBe("title");
		expect(location.searchParams.has("locale")).toBe(false);
	});

	test("permanently redirects a bare path carrying the legacy parameter", async ({
		request,
	}) => {
		const response = await request.get(`${FIXTURE_REVIEW_PATH}?locale=id`, {
			maxRedirects: 0,
		});

		expect(response.status()).toBe(308);
		expect(pathnameOf(response.headers().location)).toBe(
			`/id${FIXTURE_REVIEW_PATH}`,
		);
	});

	test("404s an unsupported locale segment", async ({ page }) => {
		const response = await page.goto("/fr/reviews");

		expect(response?.status()).toBe(404);
		await expect(
			page.getByText(/not found|404|doesn't exist/i).first(),
		).toBeVisible();
	});

	test("404s an unsupported locale on a deep link", async ({ request }) => {
		const response = await request.get(`/fr${FIXTURE_REVIEW_PATH}`);

		expect(response.status()).toBe(404);
	});

	test("leaves the admin and the feed unprefixed", async ({ request }) => {
		const admin = await request.get("/admin", { maxRedirects: 5 });
		const feed = await request.get("/feed.xml");

		expect(new URL(admin.url()).pathname.startsWith("/admin")).toBe(true);
		expect(feed.status()).toBe(200);
		expect(feed.headers()["content-type"]).toContain("application/rss+xml");
	});

	test("lands on the locale path when a reader opens a bare path", async ({
		page,
	}) => {
		await page.goto("/reviews");

		await expect(page).toHaveURL(/\/en\/reviews$/);
	});

	// The control swaps the locale segment, so the slug and the query survive.
	test("the language control keeps the rest of the URL", async ({ page }) => {
		await page.goto(`${localePath(FIXTURE_REVIEW_PATH)}?sort=title`);

		await page.getByRole("button", { name: "ID" }).first().click();

		await page.waitForURL(/\/id\/reviews\//);

		const url = new URL(page.url());

		expect(url.pathname).toBe(localePath(FIXTURE_REVIEW_PATH, "id"));
		expect(url.searchParams.get("sort")).toBe("title");
	});
});
