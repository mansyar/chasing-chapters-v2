import { expect, type Page, test } from "@playwright/test";
import {
	E2E_FIXTURE_DRAFT_REVIEW,
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_SCHEDULED_REVIEW,
} from "../../src/lib/e2e-harness";
import { loginAsFixtureAdmin } from "../fixtures/admin-session";

const HIDDEN_SLUG = E2E_FIXTURE_SCHEDULED_REVIEW.slug;
const HIDDEN_TITLE = E2E_FIXTURE_SCHEDULED_REVIEW.title;
const PUBLIC_SLUG = E2E_FIXTURE_REVIEW.slug;
const PUBLIC_TITLE = E2E_FIXTURE_REVIEW.title;
const DRAFT_SLUG = E2E_FIXTURE_DRAFT_REVIEW.slug;
const DRAFT_TITLE = E2E_FIXTURE_DRAFT_REVIEW.title;

const ENTRY = `/api/preview?slug=${HIDDEN_SLUG}&locale=en`;

const banner = (page: Page) => page.locator("aside[role='status']");

/**
 * Reads the fields a preview must never write (`NFR-3`).
 *
 * `draft: true` is what makes the newest version readable, which is exactly the
 * document a preview renders - so if previewing started a translation, this is
 * where it would show up.
 */
async function readTranslationState(page: Page, slug: string) {
	const response = await page.request.get(
		`/api/reviews?where[slug][equals]=${slug}&limit=1&depth=0&draft=true`,
	);
	expect(response.ok()).toBe(true);
	const body = (await response.json()) as {
		docs: {
			translationStatus?: string;
			translationUpdatedAt?: string | null;
			_status?: string;
		}[];
	};
	const doc = body.docs[0];
	expect(doc).toBeDefined();
	return {
		status: doc.translationStatus,
		updatedAt: doc.translationUpdatedAt,
		documentStatus: doc._status,
	};
}

test.describe("Draft preview", () => {
	// The four cases share one fixture admin, so they take turns instead of
	// racing each other's logins.
	test.describe.configure({ mode: "serial" });

	test("refuses the entry without a session and leaves the review hidden", async ({
		browser,
	}) => {
		// A separate context has no session cookie, so this is a signed-out
		// browser rather than a signed-in one with a cleared bypass cookie.
		const anonymous = await browser.newContext();
		const request = anonymous.request;

		const entry = await request.get(ENTRY, { maxRedirects: 0 });
		expect(entry.status()).toBe(401);
		// Nothing was enabled: the 401 carries no bypass cookie to reuse.
		expect(entry.headers()["set-cookie"]).toBeUndefined();

		const unsupportedLocale = await request.get(
			`/api/preview?slug=${HIDDEN_SLUG}&locale=fr`,
		);
		expect(unsupportedLocale.status()).toBe(400);

		const missingSlug = await request.get("/api/preview?slug=&locale=en");
		expect(missingSlug.status()).toBe(400);

		// The review stays invisible to this client, in both languages.
		expect((await request.get(`/en/reviews/${HIDDEN_SLUG}`)).status()).toBe(
			404,
		);
		expect((await request.get(`/id/reviews/${HIDDEN_SLUG}`)).status()).toBe(
			404,
		);

		await anonymous.close();
	});

	test("previews the scheduled review, switches locale in preview and exits", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		// The entry redirects to the public URL and sets the bypass cookie on the
		// same response, so the redirect is not a second round trip that could
		// lose it. The navigation runs through the browser, because the session
		// lives in its cookie jar.
		const entryPromise = page.waitForResponse(
			(response) =>
				response.url().includes("/api/preview?") &&
				response.request().isNavigationRequest(),
		);
		await page.goto(ENTRY);
		const entry = await entryPromise;
		expect(entry.status()).toBe(307);
		// The redirect target is the public URL and carries nothing else - no
		// token, no query - so the only authority handed on is the cookie.
		const location = new URL(entry.headers().location ?? "");
		expect(location.pathname).toBe(`/en/reviews/${HIDDEN_SLUG}`);
		expect(location.search).toBe("");
		const cookies = await page.context().cookies();
		expect(cookies.map((cookie) => cookie.name)).toContain(
			"__prerender_bypass",
		);

		await expect(page).toHaveURL(new RegExp(`/en/reviews/${HIDDEN_SLUG}$`));
		expect(new URL(page.url()).search).toBe("");

		await expect(banner(page)).toBeVisible();
		await expect(banner(page)).toContainText("Preview");
		// AC-2: a review that is invisible to the public renders its body here.
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			HIDDEN_TITLE,
		);

		// The preview response is uncacheable, whatever the ISR settings say.
		const documentResponse = await page.goto(`/en/reviews/${HIDDEN_SLUG}`);
		expect(documentResponse?.status()).toBe(200);
		const cacheControl = documentResponse?.headers()["cache-control"] ?? "";
		expect(cacheControl).toContain("private");
		expect(cacheControl).toContain("no-store");

		// AC-4: no indexable, shareable trace of a preview.
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			"content",
			/noindex/,
		);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
			"content",
			/nofollow/,
		);
		expect(await page.locator('link[rel="canonical"]').count()).toBe(0);
		expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBe(
			0,
		);
		expect(await page.locator('meta[property="og:image"]').count()).toBe(0);

		// AC-3: the other language stays in preview mode.
		await banner(page).getByRole("link").click();
		await expect(page).toHaveURL(new RegExp(`/id/reviews/${HIDDEN_SLUG}$`));
		await expect(page.locator("html")).toHaveAttribute("lang", "id");
		await expect(banner(page)).toBeVisible();
		await expect(banner(page)).toContainText("Pratinjau");
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			HIDDEN_TITLE,
		);

		// AC-3: exiting returns to the same URL and ends the preview.
		await banner(page).getByRole("button").click();
		await expect(page).toHaveURL(new RegExp(`/id/reviews/${HIDDEN_SLUG}$`));
		await expect(banner(page)).toHaveCount(0);
		// The authority is gone, so the same URL is hidden again.
		expect(
			(await page.request.get(`/id/reviews/${HIDDEN_SLUG}`)).status(),
		).toBe(404);
	});

	test("previews a never-published draft and leaves it unpublished", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		// AC-2: this document has never been published, so no reader reaches
		// it in either language.
		expect((await page.request.get(`/en/reviews/${DRAFT_SLUG}`)).status()).toBe(
			404,
		);
		expect((await page.request.get(`/id/reviews/${DRAFT_SLUG}`)).status()).toBe(
			404,
		);

		await page.goto(`/api/preview?slug=${DRAFT_SLUG}&locale=en`);
		await expect(page).toHaveURL(new RegExp(`/en/reviews/${DRAFT_SLUG}$`));
		await expect(banner(page)).toBeVisible();
		await expect(banner(page)).toContainText("Preview");
		// The body only a draft-mode session may render.
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			DRAFT_TITLE,
		);

		// Rendering the draft wrote nothing back: it is still a draft, and it
		// is still untranslated (`AC-9`). The exact-state assertion for the
		// scheduled review lives in the case below; this one pins the draft.
		const state = await readTranslationState(page, DRAFT_SLUG);
		expect(state.documentStatus).toBe("draft");
		expect(state.status).toBe("untranslated");

		// AC-3: the other language stays in preview mode, and because the
		// draft has no Indonesian body it renders the English fallback.
		await banner(page).getByRole("link").click();
		await expect(page).toHaveURL(new RegExp(`/id/reviews/${DRAFT_SLUG}$`));
		await expect(page.locator("html")).toHaveAttribute("lang", "id");
		await expect(banner(page)).toBeVisible();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			DRAFT_TITLE,
		);

		// Exiting ends the authority: the draft disappears again.
		await banner(page).getByRole("button").click();
		await expect(banner(page)).toHaveCount(0);
		expect((await page.request.get(`/id/reviews/${DRAFT_SLUG}`)).status()).toBe(
			404,
		);
	});

	test("previews a published review and exits back to it", async ({ page }) => {
		await loginAsFixtureAdmin(page);

		await page.goto(`/api/preview?slug=${PUBLIC_SLUG}&locale=en`);
		await expect(page).toHaveURL(new RegExp(`/en/reviews/${PUBLIC_SLUG}$`));
		await expect(banner(page)).toBeVisible();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			PUBLIC_TITLE,
		);

		await banner(page).getByRole("button").click();
		await expect(page).toHaveURL(new RegExp(`/en/reviews/${PUBLIC_SLUG}$`));
		await expect(banner(page)).toHaveCount(0);
		// A published review is still readable without draft mode.
		expect(
			(await page.request.get(`/en/reviews/${PUBLIC_SLUG}`)).status(),
		).toBe(200);
	});

	test("writes no translation state and lists nothing while previewing", async ({
		page,
	}) => {
		await loginAsFixtureAdmin(page);

		const before = await readTranslationState(page, HIDDEN_SLUG);

		await page.goto(ENTRY);
		await expect(banner(page)).toBeVisible();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			HIDDEN_TITLE,
		);

		const after = await readTranslationState(page, HIDDEN_SLUG);
		expect(after).toEqual(before);

		// NFR-3: the preview renders the document, but neither the sitemap nor the
		// feed learns about it - the visibility gate is untouched by preview state.
		const sitemap = await page.request.get("/sitemap.xml");
		expect(sitemap.ok()).toBe(true);
		expect(await sitemap.text()).not.toContain(HIDDEN_SLUG);

		const feed = await page.request.get("/en/feed.xml");
		expect(feed.ok()).toBe(true);
		expect(await feed.text()).not.toContain(HIDDEN_SLUG);
	});
});
