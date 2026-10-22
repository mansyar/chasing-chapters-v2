import type { Page } from "@playwright/test";
import { E2E_FIXTURE_AUTHOR } from "../../src/lib/e2e-harness";

/**
 * Shared helpers for the admin browser specs.
 *
 * The specs drive the real admin panel with the fixture author
 * (`E2E_FIXTURE_AUTHOR`), whose credential is a throwaway test-only value:
 * the account only exists in the test database.
 */

/** The admin panel entry point. */
export const ADMIN_PATH = "/admin";

/** The reviews collection in the admin panel. */
export const REVIEWS_ADMIN_PATH = "/admin/collections/reviews";

/**
 * The translation attention bell. It is an admin-shell action, so it is
 * present on every admin page - which makes it the marker for "the admin
 * session is live".
 */
export function attentionBell(page: Page) {
	return page.getByRole("button", { name: /needing attention/ });
}

/** Escapes a string so it can be used inside a regular expression. */
export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Logs the fixture author in through the custom admin login form and waits
 * for the admin shell to be ready.
 */
export async function loginAsFixtureAdmin(page: Page): Promise<void> {
	await page.goto(ADMIN_PATH);
	await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });

	// The login form is the signal for "the admin session is not live yet":
	// a successful login replaces it. A failed attempt leaves it in place,
	// so the attempt is repeated instead of failing the spec.
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		await page.locator("#email").fill(E2E_FIXTURE_AUTHOR.email);
		await page.locator("#password").fill(E2E_FIXTURE_AUTHOR.password);
		await page.getByRole("button", { name: "Sign In", exact: true }).click();
		try {
			await page
				.locator("#email")
				.waitFor({ state: "detached", timeout: 15_000 });
			await attentionBell(page).waitFor({ state: "visible", timeout: 15_000 });
			return;
		} catch {
			if (attempt === 3) {
				throw new Error("The fixture admin could not be logged in");
			}
		}
	}
}

/**
 * Resolves a review's numeric id through the REST API, using the admin
 * session of the page. The id is needed for the edit-view URLs.
 */
export async function getReviewIdBySlug(
	page: Page,
	slug: string,
): Promise<number> {
	const params = new URLSearchParams();
	params.set("where[slug][equals]", slug);
	params.set("limit", "1");
	params.set("depth", "0");
	const response = await page.request.get(`/api/reviews?${params.toString()}`);
	if (!response.ok()) {
		throw new Error(`Could not resolve review "${slug}": ${response.status()}`);
	}
	const body = (await response.json()) as {
		docs?: Array<{ id?: number | string }>;
	};
	const id = body.docs?.[0]?.id;
	if (id === undefined) {
		throw new Error(`Review "${slug}" was not found`);
	}
	return Number(id);
}
