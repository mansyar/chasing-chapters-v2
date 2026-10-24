import { expect, test } from "@playwright/test";
import { E2E_FIXTURE_REVIEW, resolveE2EBaseURL } from "../src/lib/e2e-harness";
import { LOCALE_COOKIE_NAME } from "../src/lib/i18n/locale";
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

	// `FR-2`/`AC-2`: the control stores the choice for a year, and the stored
	// choice — not the URL — decides where a bare path lands next session.
	test("the language control remembers the choice across a reload", async ({
		page,
		context,
	}) => {
		await page.goto(localePath(FIXTURE_REVIEW_PATH));

		await page.getByRole("button", { name: "ID" }).first().click();
		await page.waitForURL(/\/id\/reviews\//);

		const stored = (await context.cookies()).find(
			(cookie) => cookie.name === LOCALE_COOKIE_NAME,
		);

		expect(stored?.value).toBe("id");
		expect(stored?.sameSite).toBe("Lax");
		// Roughly a year, in seconds — the preference outlives the session.
		expect(stored?.expires).toBeGreaterThan(Date.now() / 1000 + 86_400);

		// A shared English URL is still English, and reloading it does not
		// rewrite the preference.
		await page.goto(localePath("/about", "en"));
		await page.reload();

		const afterEnglishUrl = (await context.cookies()).find(
			(cookie) => cookie.name === LOCALE_COOKIE_NAME,
		);

		expect(afterEnglishUrl?.value).toBe("id");
		expect(new URL(page.url()).pathname).toBe("/en/about");

		// …but a bare path now follows the remembered choice.
		await page.goto("/about");
		await expect(page).toHaveURL(/\/id\/about$/);
	});

	// `FR-2`: only the control writes the cookie. Following a shared Indonesian
	// link must not silently change an English reader's preference.
	test("a direct Indonesian URL leaves the stored preference alone", async ({
		page,
		context,
	}) => {
		await context.addCookies([
			{
				name: LOCALE_COOKIE_NAME,
				value: "en",
				url: BASE_URL,
			},
		]);

		await page.goto(localePath("/about", "id"));

		await expect(
			page.getByRole("heading", { name: /Tentang Chasing Chapters/i }),
		).toBeVisible();

		const stored = (await context.cookies()).find(
			(cookie) => cookie.name === LOCALE_COOKIE_NAME,
		);

		expect(stored?.value).toBe("en");
	});

	// `F1`: every public link the navbar renders carries the locale segment, so
	// a reader who followed a shared Indonesian link stays in Indonesian on the
	// first click. The stored preference is English here, and `AC-2` says a
	// direct `/id/...` visit must not rewrite it - a bare `href` would resolve
	// through the cookie and quietly turn the shared link English.
	test("keeps the page's language when the navbar is used", async ({
		page,
		context,
	}) => {
		await context.addCookies([
			{ name: LOCALE_COOKIE_NAME, value: "en", url: BASE_URL },
		]);

		await page.goto(localePath("/reviews", "id"));
		await expect(
			page.getByRole("heading", { name: "Semua Ulasan" }),
		).toBeVisible();

		await page.getByRole("link", { name: "Ulasan" }).first().click();
		await expect(page).toHaveURL(/\/id\/reviews$/);
		await expect(
			page.getByRole("heading", { name: "Semua Ulasan" }),
		).toBeVisible();

		await page.getByRole("link", { name: "Chasing Chapters" }).click();
		await expect(page).toHaveURL(/\/id$/);

		// The English side keeps its own segment the same way.
		await page.goto(localePath("/reviews", "en"));
		await page.getByRole("link", { name: "Reviews" }).first().click();
		await expect(page).toHaveURL(/\/en\/reviews$/);
		await page.getByRole("link", { name: "Chasing Chapters" }).click();
		await expect(page).toHaveURL(/\/en$/);

		// Using the navbar never rewrote the stored preference.
		const stored = (await context.cookies()).find(
			(cookie) => cookie.name === LOCALE_COOKIE_NAME,
		);

		expect(stored?.value).toBe("en");
	});

	// `F4`: the proxy decides "this is a file, leave it alone" from the last
	// path segment, not from any dot in the URL. A slug may contain one, and a
	// page addressed that way still has to be localized.
	test("keeps a dotted slug on the page path instead of treating it as a file", async ({
		request,
	}) => {
		const response = await request.get("/reviews/my.book", {
			maxRedirects: 0,
		});

		expect(response.status()).toBe(307);
		expect(pathnameOf(response.headers().location)).toBe("/en/reviews/my.book");
	});

	test("does not localize a static asset", async ({ request }) => {
		// `/og-image.jpg` is not on disk here, but the proxy's job is to leave it
		// alone: a locale segment in front of a file would 404 at the CDN.
		const response = await request.get("/og-image.jpg", { maxRedirects: 0 });

		expect(response.status()).not.toBe(307);
		expect(response.headers().location).toBeUndefined();
	});
});
