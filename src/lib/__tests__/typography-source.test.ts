import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `AC-1` (Phase 1, track 20261026-content-typography): the typography plugin is
 * actually wired up, not assumed.
 *
 * `prose` was used at eight sites while `@tailwindcss/typography` was never
 * installed, so every one of them silently rendered unstyled. These assertions
 * pin the two facts that make `prose` real — the `@plugin` directive in
 * `globals.css` and the devDependency in `package.json` — plus the token theme
 * that keeps the plugin's palette off its grey defaults, and the three sites
 * that must stay prose-free because they want clamped or skeleton styling.
 */
const GLOBALS_CSS_PATH = join(process.cwd(), "src/app/globals.css");
const PACKAGE_JSON_PATH = join(process.cwd(), "package.json");
const REVIEW_PAGE_PATH = join(
	process.cwd(),
	"src/app/(public)/[locale]/reviews/[slug]/page.tsx",
);

const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
	devDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
};
const reviewPage = readFileSync(REVIEW_PAGE_PATH, "utf8");

describe("typography plugin wiring", () => {
	test("globals.css registers the typography plugin via @plugin", () => {
		expect(globalsCss).toContain('@plugin "@tailwindcss/typography";');
	});

	test("the plugin is a devDependency, not a runtime dependency", () => {
		expect(Object.keys(packageJson.devDependencies ?? {})).toContain(
			"@tailwindcss/typography",
		);
		expect(Object.keys(packageJson.dependencies ?? {})).not.toContain(
			"@tailwindcss/typography",
		);
	});

	test("the prose theme maps the plugin variables onto the site tokens", () => {
		expect(globalsCss).toContain("@utility prose-teal");
		expect(globalsCss).toContain("--tw-prose-body: var(--foreground);");
		expect(globalsCss).toContain("--tw-prose-links: var(--primary);");
		expect(globalsCss).toContain("--tw-prose-quote-borders: var(--primary);");
		expect(globalsCss).toContain(
			"--tw-prose-captions: var(--muted-foreground);",
		);
		expect(globalsCss).toContain("--tw-prose-hr: var(--border);");
		// The invert set mirrors the base set, so `dark:prose-invert` resolves
		// through the same `.dark` tokens instead of the plugin's grey palette.
		expect(globalsCss).toContain("--tw-prose-invert-body: var(--foreground);");
		expect(globalsCss).toContain("--tw-prose-invert-links: var(--primary);");
	});

	/**
	 * The hero excerpt, the carousel excerpt and the loading skeleton carried
	 * `prose` for a clamped/skeleton look the plugin would break once active.
	 * They must stay prose-free — a regression here reintroduces prose margins
	 * and sizing on above-the-fold content (NFR-2).
	 */
	test("the clamped excerpts and the skeleton stay prose-free", () => {
		const proseFreeFiles = [
			"src/components/FeaturedHero.tsx",
			"src/components/ModernBookCarousel.tsx",
			"src/app/(public)/[locale]/reviews/[slug]/loading.tsx",
		];

		for (const file of proseFreeFiles) {
			const source = readFileSync(join(process.cwd(), file), "utf8");
			expect(source).not.toContain("prose");
		}
	});
});

/**
 * `AC-2` (Phase 2, track 20261026-content-typography): the three structured
 * sections on the review detail page are token-driven.
 *
 * They used to hardcode Tailwind's green/orange/blue palette against the
 * site's teal oklch token set and rendered wrong in dark mode. The semantic
 * `positive` / `warning` / `info` tokens live in `globals.css` (`:root` and
 * `.dark`), exposed through `@theme inline`, so the utilities recolour
 * themselves when the theme flips and no palette class can regress here
 * unnoticed.
 */
describe("structured section tokens", () => {
	// Slice only the structured-section blocks so the assertion cannot be
	// satisfied by accident elsewhere on the page (the star rating, the cards
	// and the quotes are other phases' territory).
	const sectionsStart = reviewPage.indexOf("{/* Structured Sections */}");
	const sectionsEnd = reviewPage.indexOf("{/* Favorite Quotes */}");
	const sections = reviewPage.slice(sectionsStart, sectionsEnd);

	test("the structured-section blocks are where we think they are", () => {
		expect(sectionsStart).toBeGreaterThan(-1);
		expect(sectionsEnd).toBeGreaterThan(sectionsStart);
	});

	test("no hardcoded palette colour classes remain in the structured sections", () => {
		// `dark:bg-green-` and friends are covered: each forbidden substring
		// matches the dark variant too, because it contains the same prefix.
		for (const palette of ["green", "orange", "blue"]) {
			for (const role of ["bg", "border", "text"]) {
				expect(sections).not.toContain(`${role}-${palette}-`);
			}
		}
	});

	test("the sections use the semantic token utilities", () => {
		for (const token of ["positive", "warning", "info"]) {
			expect(sections).toContain(`bg-${token}/10`);
			expect(sections).toContain(`border-${token}/30`);
			expect(sections).toContain(`text-${token}"`);
		}
		// Layout is preserved by the re-tokenization: Perfect For still spans.
		expect(sections).toContain("md:col-span-2");
	});

	test("globals.css defines the semantic tokens for both modes", () => {
		for (const token of ["positive", "warning", "info"]) {
			expect(globalsCss).toContain(`--color-${token}: var(--${token});`);
			expect(globalsCss).toContain(`--${token}: oklch(`);
		}
	});
});

/**
 * The mood badge used to build its alpha by appending hex suffixes to the
 * colour (`mood.color + "20"` for the background, `+ "40"` for the border).
 * That only produces a valid colour when `mood.color` is 6-digit hex — any
 * other format (`rgb()`, 8-digit hex, a named colour) silently renders an
 * invalid style. `color-mix(in srgb, ...)` is format-safe.
 */
describe("mood badge colour safety", () => {
	test("the badge alpha comes from color-mix, not a hex-append suffix", () => {
		expect(reviewPage).not.toContain('+ "20"');
		expect(reviewPage).not.toContain('+ "40"');
		// The old suffixes encoded alpha: 0x20/255 ≈ 12.5%, 0x40/255 ≈ 25%.
		expect(reviewPage).toContain(
			"color-mix(in srgb, ${mood.color} 12.5%, transparent)",
		);
		expect(reviewPage).toContain(
			"color-mix(in srgb, ${mood.color} 25%, transparent)",
		);
	});
});
