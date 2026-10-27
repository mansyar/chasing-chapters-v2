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
const PLUGIN_STYLES_PATH = join(
	process.cwd(),
	"node_modules/@tailwindcss/typography/src/styles.js",
);

const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf8");
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
	devDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
};
const reviewPage = readFileSync(REVIEW_PAGE_PATH, "utf8");
const pluginStyles = readFileSync(PLUGIN_STYLES_PATH, "utf8");

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
	 * A `pre` must not flip its pair between modes. Text-on-background inverted
	 * into a near-white slab on a dark page; `--muted` behind `--foreground` is
	 * dark-on-light in light mode and light-on-dark in dark mode, which is the
	 * same reading direction in both.
	 */
	test("code blocks are a mode-stable pair, not an inverted one", () => {
		expect(globalsCss).toContain("--tw-prose-pre-bg: var(--muted);");
		expect(globalsCss).toContain("--tw-prose-pre-code: var(--foreground);");
		expect(globalsCss).toContain("--tw-prose-invert-pre-bg: var(--muted);");
		expect(globalsCss).toContain(
			"--tw-prose-invert-pre-code: var(--foreground);",
		);

		// The old flipping pair is what made the block glare in dark mode.
		expect(globalsCss).not.toContain("--tw-prose-pre-bg: var(--foreground);");
		expect(globalsCss).not.toContain("--tw-prose-pre-code: var(--background);");
		expect(globalsCss).not.toContain(
			"--tw-prose-invert-pre-bg: var(--foreground);",
		);
		expect(globalsCss).not.toContain(
			"--tw-prose-invert-pre-code: var(--background);",
		);
	});

	/**
	 * The hero excerpt, the carousel excerpt and the loading skeleton carried
	 * `prose` for a clamped/skeleton look the plugin would break once active.
	 * They must stay prose-free — a regression here reintroduces prose margins
	 * and sizing on above-the-fold content (NFR-2).
	 *
	 * Match the class position, not the bare substring: a comment, identifier or
	 * variable name mentioning "prose" is not a class, and failing on one is the
	 * false positive that gets a guard like this deleted.
	 */
	const proseClassPatterns = [
		/className="[^"]*\bprose\b/,
		/className=\{`[^`]*\bprose\b/,
		// `className={cn("prose", size)}` is this repo's dominant idiom - 22 sites
		// under src/, two of them inside a guarded file - so a guard that only
		// understood the two literal forms above would miss the most likely way
		// the regression comes back.
		/className=\{cn\([^)]*\bprose\b/,
	];

	test("the clamped excerpts and the skeleton stay prose-free", () => {
		const proseFreeFiles = [
			"src/components/FeaturedHero.tsx",
			"src/components/ModernBookCarousel.tsx",
			"src/app/(public)/[locale]/reviews/[slug]/loading.tsx",
		];

		for (const file of proseFreeFiles) {
			const source = readFileSync(join(process.cwd(), file), "utf8");

			for (const pattern of proseClassPatterns) {
				expect(source).not.toMatch(pattern);
			}
		}
	});

	test("the guard matches a re-added prose class and ignores the word elsewhere", () => {
		// The guard is only worth keeping if it still fires on the regression it
		// exists for, and only if it stops firing on prose used as a word.
		const regressions = [
			'<div className="prose line-clamp-3">',
			'<div className="max-w-none prose line-clamp-3">',
			"<div className={`prose ${size}`}>",
			'<div className={cn("prose", size)}>',
			'<div className={cn("max-w-none", "prose")}>',
		];
		const innocent = [
			"// prose would break this clamped excerpt",
			"const proseFree = true;",
			'<div className="max-w-none line-clamp-3">',
		];

		for (const source of regressions) {
			expect(proseClassPatterns.some((pattern) => pattern.test(source))).toBe(
				true,
			);
		}

		for (const source of innocent) {
			expect(proseClassPatterns.some((pattern) => pattern.test(source))).toBe(
				false,
			);
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

/**
 * `NFR-2` (no LCP or CLS regression): a `sizes` attribute has to describe the
 * grid the image is actually laid out in, because it is what the browser uses to
 * pick a srcset candidate. `ReadingListCard` is rendered into two different
 * grids — the home page's 2/4 columns and the reading-lists index's 1/2/3 — so a
 * single hardcoded value under-declares the index's covers at mobile widths and
 * they render upscaled and soft.
 *
 * This is a source-level guard rather than a measurement: the pixel outcome needs
 * a real layout, but the two facts that produce it — the card forwards `sizes`
 * and the index passes its own — are visible in the source.
 */
describe("reading-list cover sizes", () => {
	const cardSource = readFileSync(
		join(process.cwd(), "src/components/ReadingListCard.tsx"),
		"utf8",
	);
	const indexSource = readFileSync(
		join(process.cwd(), "src/app/(public)/[locale]/reading-lists/page.tsx"),
		"utf8",
	);

	test("the card forwards its `sizes` prop to the image", () => {
		expect(cardSource).toContain("sizes?: string;");
		expect(cardSource).toContain("sizes={sizes}");
		// The home page's grid is the default: two columns below `lg`, four above,
		// so the declaration has to switch at 1024 - the same breakpoint the grid
		// uses. It said 768 until the delta re-review noticed the 769-1023 band
		// declaring half the width its covers occupy.
		expect(cardSource).toContain('sizes = "(max-width: 1023px) 50vw, 25vw",');
	});

	test("the index declares its own single-column mobile width", () => {
		expect(indexSource).toContain(
			'sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"',
		);
	});
});

/**
 * `FR-5` (track 20261027-typography-residuals): `prose-teal` maps the
 * plugin's variables by hand, so a plugin release that adds or renames a
 * `--tw-prose-*` variable would otherwise render that element unthemed.
 * This guard enumerates the variables from the installed plugin's own
 * `src/styles.js` and asserts each one is assigned inside the
 * `@utility prose-teal` block. It pins coverage of whatever is installed —
 * not an exact plugin version — so it passes today and names the missing
 * variable on the upgrade that changes the surface.
 */
describe("prose-teal plugin coverage", () => {
	test("every installed plugin variable is mapped in prose-teal", () => {
		const pluginVariables = [
			...new Set(pluginStyles.match(/--tw-prose-[a-z-]+/g) ?? []),
		].sort();

		// The extraction is the assertion's premise: an empty set means the
		// plugin moved its variables elsewhere, not that coverage is complete.
		expect(pluginVariables.length).toBeGreaterThan(0);

		// Slice only the `@utility prose-teal` block so a variable assigned
		// anywhere else in the stylesheet cannot satisfy the guard.
		const blockStart = globalsCss.indexOf("@utility prose-teal");
		expect(blockStart).toBeGreaterThan(-1);
		const blockOpen = globalsCss.indexOf("{", blockStart);
		let depth = 0;
		let blockEnd = -1;
		for (let i = blockOpen; i < globalsCss.length; i++) {
			if (globalsCss[i] === "{") {
				depth++;
			}
			if (globalsCss[i] === "}") {
				depth--;
				if (depth === 0) {
					blockEnd = i;
					break;
				}
			}
		}
		expect(blockEnd).toBeGreaterThan(blockOpen);
		const proseTealBlock = globalsCss.slice(blockStart, blockEnd + 1);

		for (const variable of pluginVariables) {
			expect(proseTealBlock).toContain(`${variable}:`);
		}
	});
});
