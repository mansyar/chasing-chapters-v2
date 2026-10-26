import type { Browser, BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_AUTHOR,
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_READING_LIST_LOCALIZED,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

/**
 * Reading-lists pagination (`FR-3`, `FR-4`, `AC-8`).
 *
 * The fixture seeds a single reading list, so the suite brings its own
 * second page: ten probe lists are created before the flow runs and removed
 * afterwards. The probes are the newest lists, so page 1 holds probes and
 * page 2 holds the oldest probe plus the fixture list - which is what lets
 * the specs prove the slices differ without depending on seed order.
 *
 * The probes are never featured and carry fixed slugs, so the homepage
 * carousel and the other public specs keep passing while they exist, and the
 * serial mode keeps the create/probe/remove sequence in declaration order.
 */
test.describe.configure({ mode: "serial" });

/** Ten probes plus the fixture list make two pages of nine. */
const PROBE_COUNT = 10;

function probeSlug(index: number): string {
	return `e2e-pagination-probe-${String(index).padStart(2, "0")}`;
}

function probeTitle(index: number): string {
	return `E2E Pagination Probe ${String(index).padStart(2, "0")}`;
}

type AdminSession = {
	context: BrowserContext;
	headers: Record<string, string>;
	authorId: number;
};

let adminSession: AdminSession | null = null;

async function loginAdmin(browser: Browser): Promise<AdminSession> {
	const context = await browser.newContext();
	const login = await context.request.post("/api/authors/login", {
		data: {
			email: E2E_FIXTURE_AUTHOR.email,
			password: E2E_FIXTURE_AUTHOR.password,
		},
	});
	if (!login.ok()) {
		throw new Error(
			`The fixture admin could not be logged in: ${login.status()}`,
		);
	}
	const body = (await login.json()) as {
		token?: string;
		user?: { id?: number | string };
	};
	if (!body.token || body.user?.id === undefined) {
		throw new Error("The fixture admin login returned no token.");
	}
	return {
		context,
		headers: { Authorization: `JWT ${body.token}` },
		authorId: Number(body.user.id),
	};
}

async function probeIdBySlug(
	session: AdminSession,
	slug: string,
): Promise<number | null> {
	const params = new URLSearchParams();
	params.set("where[slug][equals]", slug);
	params.set("limit", "1");
	params.set("depth", "0");
	const response = await session.context.request.get(
		`/api/reading-lists?${params.toString()}`,
		{ headers: session.headers },
	);
	if (!response.ok()) {
		throw new Error(`Could not resolve reading list "${slug}".`);
	}
	const body = (await response.json()) as {
		docs?: Array<{ id?: number | string }>;
	};
	const id = body.docs?.[0]?.id;
	return id === undefined ? null : Number(id);
}

async function deleteProbe(
	session: AdminSession,
	index: number,
): Promise<void> {
	const id = await probeIdBySlug(session, probeSlug(index));
	if (id === null) {
		return;
	}
	const response = await session.context.request.delete(
		`/api/reading-lists/${id}`,
		{ headers: session.headers },
	);
	if (!response.ok()) {
		throw new Error(
			`Could not delete reading list "${probeSlug(index)}": ${response.status()}`,
		);
	}
}

async function createProbe(
	session: AdminSession,
	index: number,
): Promise<void> {
	const response = await session.context.request.post("/api/reading-lists", {
		headers: session.headers,
		data: {
			title: probeTitle(index),
			slug: probeSlug(index),
			author: session.authorId,
			reviews: [],
			featured: false,
			_status: "published",
		},
	});
	if (!response.ok()) {
		throw new Error(
			`Could not create reading list "${probeSlug(index)}": ${response.status()}`,
		);
	}
}

test.describe("Reading-lists pagination", () => {
	test.beforeAll(async ({ browser }) => {
		const session = await loginAdmin(browser);
		adminSession = session;
		// Idempotent setup: a previous interrupted run may have left probes.
		for (let index = 1; index <= PROBE_COUNT; index += 1) {
			await deleteProbe(session, index);
		}
		for (let index = 1; index <= PROBE_COUNT; index += 1) {
			await createProbe(session, index);
		}
	});

	test.afterAll(async () => {
		if (!adminSession) {
			return;
		}
		for (let index = 1; index <= PROBE_COUNT; index += 1) {
			await deleteProbe(adminSession, index);
		}
		await adminSession.context.close();
		adminSession = null;
	});

	test("shows the second slice on page 2 in English", async ({ page }) => {
		await page.goto(localePath("/reading-lists?page=2"));

		// The fixture list is the oldest, so it sits on the second page.
		await expect(
			page.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title }),
		).toBeVisible();
		// A probe from the first page does not repeat on the second.
		await expect(
			page.getByRole("heading", { name: probeTitle(PROBE_COUNT) }),
		).toHaveCount(0);
	});

	test("shows the first slice on page 1 in English", async ({ page }) => {
		await page.goto(localePath("/reading-lists"));

		await expect(
			page.getByRole("heading", { name: probeTitle(PROBE_COUNT) }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title }),
		).toHaveCount(0);
	});

	test("renders page 1 for a non-numeric page param", async ({ page }) => {
		await page.goto(localePath("/reading-lists?page=abc"));

		// Same content as the clean first page: a probe, not the fixture.
		await expect(
			page.getByRole("heading", { name: probeTitle(PROBE_COUNT) }),
		).toBeVisible();
		await expect(
			page.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title }),
		).toHaveCount(0);
		// The pager still renders, pointing at the second page.
		const pageTwo = page.getByRole("link", { name: "2", exact: true });
		await expect(pageTwo).toBeVisible();
		await expect(pageTwo).toHaveAttribute("href", "/en/reading-lists?page=2");
	});

	test("carries the locale path on every pager link", async ({ page }) => {
		await page.goto(localePath("/reading-lists"));

		const pageTwo = page.getByRole("link", { name: "2", exact: true });
		await expect(pageTwo).toHaveAttribute("href", "/en/reading-lists?page=2");
		const next = page.getByRole("link", { name: /next/i });
		await expect(next).toHaveAttribute("href", "/en/reading-lists?page=2");
	});

	test("keeps the locale across pager navigation in Indonesian", async ({
		page,
	}) => {
		await page.goto(localePath("/reading-lists", "id"));

		// The pager renders in Indonesian and links stay under /id.
		const pageTwo = page.getByRole("link", { name: "2", exact: true });
		await expect(pageTwo).toHaveAttribute("href", "/id/reading-lists?page=2");

		await pageTwo.click();
		await expect(page).toHaveURL(/\/id\/reading-lists\?page=2/);
		expect(new URL(page.url()).pathname).toBe("/id/reading-lists");

		// The second slice in Indonesian: the fixture carries an Indonesian
		// title, the probes fall back to their English ones.
		await expect(
			page.getByRole("heading", {
				name: E2E_FIXTURE_READING_LIST_LOCALIZED.title,
			}),
		).toBeVisible();

		// Navigating back keeps the locale too.
		const previous = page.getByRole("link", { name: /sebelumnya/i });
		await expect(previous).toHaveAttribute("href", "/id/reading-lists?page=1");
		await previous.click();
		await expect(page).toHaveURL(/\/id\/reading-lists\?page=1/);
		expect(new URL(page.url()).pathname).toBe("/id/reading-lists");
	});

	test("hides the pager once the index fits on one page", async ({
		page,
		request,
	}) => {
		// The probes made this a two-page index; removing them returns the
		// suite to the single fixture list, so the `totalPages > 1` gate hides
		// the pager again (the empty library takes the same branch, since it
		// also renders the empty state instead of a pager).
		const login = await request.post("/api/authors/login", {
			data: {
				email: E2E_FIXTURE_AUTHOR.email,
				password: E2E_FIXTURE_AUTHOR.password,
			},
		});
		expect(login.ok()).toBe(true);
		const body = (await login.json()) as { token?: string };
		if (!body.token) {
			throw new Error("The fixture admin login returned no token.");
		}
		const headers: Record<string, string> = {
			Authorization: `JWT ${body.token}`,
		};
		for (let index = 1; index <= PROBE_COUNT; index += 1) {
			const params = new URLSearchParams();
			params.set("where[slug][equals]", probeSlug(index));
			params.set("limit", "1");
			params.set("depth", "0");
			const found = await request.get(
				`/api/reading-lists?${params.toString()}`,
				{ headers },
			);
			const foundBody = (await found.json()) as {
				docs?: Array<{ id?: number | string }>;
			};
			const id = foundBody.docs?.[0]?.id;
			if (id !== undefined) {
				await request.delete(`/api/reading-lists/${Number(id)}`, {
					headers,
				});
			}
		}

		await page.goto(localePath("/reading-lists"));
		await expect(
			page.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title }),
		).toBeVisible();
		await expect(page.locator('nav[aria-label="Pagination"]')).toHaveCount(0);

		await page.goto(localePath("/reading-lists", "id"));
		await expect(
			page.getByRole("heading", {
				name: E2E_FIXTURE_READING_LIST_LOCALIZED.title,
			}),
		).toBeVisible();
		await expect(
			page.locator('nav[aria-label="Navigasi halaman"]'),
		).toHaveCount(0);
	});
});
