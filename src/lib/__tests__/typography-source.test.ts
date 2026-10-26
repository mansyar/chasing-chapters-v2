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

const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
	devDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
};

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
