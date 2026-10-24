import { expect, type Page, test } from "@playwright/test";
import {
	E2E_FIXTURE_READING_LIST_PATH,
	E2E_FIXTURE_REVIEW_PATH,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

/**
 * The language control's accessibility bar (`NFR-1`) and the document language
 * every public page declares (`FR-5`, `AC-5`), plus the two claims those need
 * a live browser to make: the focus ring is real and keyboard-reachable, and
 * the dictionary never reaches the client bundle (`NFR-2`).
 *
 * The contrast check measures the *rendered* colours rather than the tokens, so
 * it fails if a class change, a theme change or a token change drops the active
 * label below the floor — the attribute assertions cannot see that.
 */

/** Interface copy from the dictionary, asserted against what the reader sees. */
const SKIP_LINK = { en: "Skip to content", id: "Lewati ke konten" } as const;
const GROUP_NAME = { en: "Language", id: "Bahasa" } as const;

/** The active option's measured ratio, per theme (`globals.css` tokens). */
const ACTIVE_CONTRAST = { light: 4.95, dark: 7.77 } as const;

/** Every public page shape, so the document language is checked on all of them. */
const PUBLIC_PATHS = [
	"/",
	"/about",
	"/reviews",
	E2E_FIXTURE_REVIEW_PATH,
	"/reading-lists",
	E2E_FIXTURE_READING_LIST_PATH,
] as const;

/** Distinctive Indonesian copy that must exist in the HTML and not in a chunk. */
const SERVER_ONLY_STRINGS = ["Lewati ke konten", "Daftar Bacaan"];

const THEMES = ["light", "dark"] as const;

interface Rgb {
	r: number;
	g: number;
	b: number;
}

/**
 * The sRGB value of a CSS colour, read back from a canvas.
 *
 * The tokens are authored in `oklch()`, so parsing them by hand would be a
 * second implementation of colour management; the browser already has one.
 */
async function renderedColor(page: Page, color: string): Promise<Rgb> {
	return page.evaluate((value) => {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext("2d");

		if (!context) {
			throw new Error("The browser has no 2d canvas context.");
		}

		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);

		const [r, g, b] = context.getImageData(0, 0, 1, 1).data;

		return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
	}, color);
}

/** WCAG 2.x relative luminance. */
function luminance({ r, g, b }: Rgb): number {
	const channel = (value: number) => {
		const scaled = value / 255;

		return scaled <= 0.03928
			? scaled / 12.92
			: ((scaled + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1:1 to 21:1. */
function contrastRatio(a: Rgb, b: Rgb): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

	return (lighter + 0.05) / (darker + 0.05);
}

/** The theme the page is actually wearing, not the one that was requested. */
async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
	await page.emulateMedia({ colorScheme: theme });

	await expect
		.poll(() =>
			page.evaluate(() => document.documentElement.classList.contains("dark")),
		)
		.toBe(theme === "dark");
}

/** Tabs until focus lands on one of the language control's options. */
async function tabToLanguageControl(page: Page): Promise<void> {
	for (let press = 0; press < 40; press += 1) {
		await page.keyboard.press("Tab");

		const focused = await page.evaluate(() => {
			const active = document.activeElement;

			return (
				active instanceof HTMLElement &&
				active.hasAttribute("aria-pressed") &&
				active.closest('[role="group"]') !== null
			);
		});

		if (focused) {
			return;
		}
	}

	throw new Error("The language control was not reachable with the keyboard.");
}

/** The focused element's own report of what a keyboard user sees. */
async function focusedOption(page: Page) {
	return page.evaluate(() => {
		const active = document.activeElement;

		if (!(active instanceof HTMLElement)) {
			throw new Error("Nothing is focused.");
		}

		const style = getComputedStyle(active);

		return {
			label: (active.textContent ?? "").trim(),
			shadow: style.boxShadow,
			outline: style.outlineStyle,
		};
	});
}

test.describe("Language control accessibility", () => {
	for (const locale of ["en", "id"] as const) {
		test(`exposes the current language and the group name in ${locale}`, async ({
			page,
		}) => {
			await page.goto(localePath("/about", locale));

			const group = page.getByRole("group", { name: GROUP_NAME[locale] });
			await expect(group).toBeVisible();

			const english = group.getByRole("button", { name: "EN", exact: true });
			const indonesian = group.getByRole("button", { name: "ID", exact: true });

			// The pressed state names which language is being read, and the labels
			// carry their own `lang` so a screen reader pronounces them correctly.
			await expect(english).toHaveAttribute(
				"aria-pressed",
				locale === "en" ? "true" : "false",
			);
			await expect(indonesian).toHaveAttribute(
				"aria-pressed",
				locale === "id" ? "true" : "false",
			);
			await expect(english).toHaveAttribute("lang", "en");
			await expect(indonesian).toHaveAttribute("lang", "id");

			// The target is announced too, in words rather than the two letters.
			await expect(english).toHaveAttribute("title", "English");
			await expect(indonesian).toHaveAttribute("title", "Bahasa Indonesia");
		});
	}

	for (const theme of THEMES) {
		test(`keeps the active label legible in the ${theme} theme`, async ({
			page,
		}) => {
			await page.emulateMedia({ colorScheme: theme });
			await page.goto(localePath("/about", "en"));
			await useTheme(page, theme);

			const active = page.getByRole("button", { name: "EN", exact: true });
			await expect(active).toHaveAttribute("aria-pressed", "true");

			const style = await active.evaluate((element) => {
				const computed = getComputedStyle(element);

				return { color: computed.color, background: computed.backgroundColor };
			});

			const ratio = contrastRatio(
				await renderedColor(page, style.color),
				await renderedColor(page, style.background),
			);

			// WCAG 2.2 AA for this size of label. The pinned value is the ratio the
			// tokens produce today, so a colour change that still passes 4.5:1 is
			// reported as the change it is rather than passing silently.
			expect(ratio).toBeGreaterThanOrEqual(4.5);
			expect(ratio).toBeCloseTo(ACTIVE_CONTRAST[theme], 0);
		});
	}

	for (const theme of THEMES) {
		test(`switches language from the keyboard with a visible ring in the ${theme} theme`, async ({
			page,
		}) => {
			await page.emulateMedia({ colorScheme: theme });
			await page.goto(localePath("/about", "en"));
			await useTheme(page, theme);

			await tabToLanguageControl(page);

			const first = await focusedOption(page);
			expect(first.label).toBe("EN");
			expect(first.shadow).not.toBe("none");
			expect(first.shadow).toContain("rgb");

			// One more tab reaches the other option, which is the one to activate.
			await page.keyboard.press("Tab");

			const target = await focusedOption(page);
			expect(target.label).toBe("ID");
			expect(target.shadow).not.toBe("none");

			await page.keyboard.press("Enter");
			await page.waitForURL(/\/id\/about$/);

			await expect(
				page.getByRole("heading", { level: 1, name: /Tentang/i }),
			).toBeVisible();
		});
	}

	test("switches the browse page without dropping its query string", async ({
		page,
	}) => {
		await page.goto(`${localePath("/reviews", "en")}?sort=title&page=2`);

		await page.getByRole("button", { name: "ID", exact: true }).first().click();
		await page.waitForURL(/\/id\/reviews\?/);

		const url = new URL(page.url());
		expect(url.pathname).toBe("/id/reviews");
		expect(url.searchParams.get("sort")).toBe("title");
		expect(url.searchParams.get("page")).toBe("2");
	});

	test("keeps the dictionary off the client and reports the JS it ships", async ({
		page,
	}) => {
		const response = await page.goto(localePath("/", "id"));
		const html = await response?.text();

		// The strings are in the document the server sent ...
		for (const copy of SERVER_ONLY_STRINGS) {
			expect(html).toContain(copy);
		}

		// ... and in none of the JavaScript the browser fetches for it.
		const scripts = await page.evaluate(() =>
			Array.from(document.querySelectorAll("script[src]"))
				.map(
					(script) =>
						new URL(script.getAttribute("src") ?? "", location.href).pathname,
				)
				.filter((path) => path.startsWith("/_next/")),
		);

		expect(scripts.length).toBeGreaterThan(0);

		const chunks: Array<{ path: string; bytes: number }> = [];
		const offenders: string[] = [];

		for (const src of scripts) {
			const chunk = await page.request.get(src);
			expect(chunk.ok(), src).toBe(true);

			const body = await chunk.body();
			chunks.push({ path: src, bytes: body.byteLength });

			if (
				SERVER_ONLY_STRINGS.some((copy) => body.toString("utf8").includes(copy))
			) {
				offenders.push(src);
			}
		}

		const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

		expect(offenders).toEqual([]);
		expect(totalBytes).toBeGreaterThan(0);
		// `NFR-2`: a ceiling 4% above the measured total (`1,532,683` bytes of
		// uncompressed JavaScript across the chunks this page loads). There is no
		// recorded pre-track baseline to diff against, so this catches a material
		// regression on the path the track touched instead.
		expect(totalBytes).toBeLessThan(1_600_000);
	});
});

test.describe("Document language", () => {
	for (const locale of ["en", "id"] as const) {
		test(`declares ${locale} on every public page`, async ({ page }) => {
			for (const path of PUBLIC_PATHS) {
				const response = await page.goto(localePath(path, locale));

				expect(response?.status(), path).toBe(200);
				await expect(page.locator("html"), path).toHaveAttribute(
					"lang",
					locale,
				);

				// The chrome around the page is in the same language as the document:
				// the skip link is the first thing the interface renders (`AC-4`).
				await expect(
					page.getByRole("link", { name: SKIP_LINK[locale] }),
					path,
				).toHaveCount(1);

				const otherLocale = locale === "en" ? "id" : "en";
				await expect(
					page.getByText(SKIP_LINK[otherLocale], { exact: true }),
					path,
				).toHaveCount(0);
			}
		});
	}

	test("declares the language it serves on the 404s", async ({ page }) => {
		// An unsupported locale segment has no locale of its own, so the root
		// boundary answers — in English, on an English document.
		const unsupported = await page.goto("/fr/reviews");
		expect(unsupported?.status()).toBe(404);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");

		// A 404 raised inside a locale segment keeps that segment's shell, so the
		// document is the locale the URL asked for. The body is still the root
		// boundary's English copy — the follow-up recorded in the phase evidence.
		for (const locale of ["en", "id"] as const) {
			const response = await page.goto(
				localePath("/reviews/not-a-published-review", locale),
			);

			expect(response?.status(), locale).toBe(404);
			await expect(page.locator("html"), locale).toHaveAttribute(
				"lang",
				locale,
			);
		}
	});
});
