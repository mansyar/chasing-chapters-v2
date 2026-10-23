import { describe, expect, test } from "bun:test";
import {
	DEFAULT_LOCALE,
	hasLocale,
	isUnprefixedPublicPath,
	LOCALE_COOKIE_NAME,
	Locale,
	localeSwitchHref,
	localizedPaths,
	localizePath,
	normalizeLocale,
	PUBLIC_PATH_ROOTS,
	pathLocale,
	resolveLocale,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";

describe("hasLocale", () => {
	test("accepts the supported locales", () => {
		expect(hasLocale("en")).toBe(true);
		expect(hasLocale("id")).toBe(true);
	});

	test("rejects anything else", () => {
		expect(hasLocale("fr")).toBe(false);
		expect(hasLocale("EN")).toBe(false);
		expect(hasLocale("")).toBe(false);
		expect(hasLocale(undefined)).toBe(false);
		expect(hasLocale(null)).toBe(false);
		expect(hasLocale(42)).toBe(false);
	});
});

describe("normalizeLocale", () => {
	test("keeps a supported locale", () => {
		expect(normalizeLocale("id")).toBe("id");
		expect(normalizeLocale("en")).toBe("en");
	});

	test("falls back to English for anything unsupported", () => {
		expect(normalizeLocale("fr")).toBe("en");
		expect(normalizeLocale("ID")).toBe("en");
		expect(normalizeLocale("")).toBe("en");
		expect(normalizeLocale(undefined)).toBe("en");
		expect(normalizeLocale(null)).toBe("en");
	});
});

describe("resolveLocale", () => {
	test("prefers the path over the cookie", () => {
		expect(resolveLocale({ pathLocale: "id", cookieLocale: "en" })).toBe("id");
	});

	test("uses the cookie when the path carries no locale", () => {
		expect(resolveLocale({ cookieLocale: "id" })).toBe("id");
	});

	test("falls back to English when neither is usable", () => {
		expect(resolveLocale({})).toBe("en");
		expect(resolveLocale({ pathLocale: "fr", cookieLocale: "de" })).toBe("en");
		expect(resolveLocale({ cookieLocale: "" })).toBe("en");
	});
});

describe("localizePath", () => {
	test("prefixes the root without a trailing slash", () => {
		expect(localizePath("/", "en")).toBe("/en");
		expect(localizePath("", "id")).toBe("/id");
	});

	test("inserts the segment on an unprefixed path", () => {
		expect(localizePath("/reviews", "en")).toBe("/en/reviews");
		expect(localizePath("/reviews/book-one", "id")).toBe(
			"/id/reviews/book-one",
		);
	});

	test("swaps the segment while keeping slug, depth and trailing segments", () => {
		expect(localizePath("/en/reviews/book-one", "id")).toBe(
			"/id/reviews/book-one",
		);
		expect(localizePath("/id/reading-lists/cozy", "en")).toBe(
			"/en/reading-lists/cozy",
		);
		expect(localizePath("/en/about", "id")).toBe("/id/about");
	});

	test("treats an unsupported first segment as part of the path", () => {
		expect(localizePath("/fr/reviews", "en")).toBe("/en/fr/reviews");
	});
});

describe("pathLocale", () => {
	test("reads a supported locale segment", () => {
		expect(pathLocale("/id/reviews")).toBe("id");
		expect(pathLocale("/en")).toBe("en");
	});

	test("returns null when the first segment is not a locale", () => {
		expect(pathLocale("/reviews")).toBeNull();
		expect(pathLocale("/fr/reviews")).toBeNull();
		expect(pathLocale("/")).toBeNull();
	});
});

describe("isUnprefixedPublicPath", () => {
	test("matches the root and the public roots", () => {
		expect(isUnprefixedPublicPath("/")).toBe(true);

		for (const root of PUBLIC_PATH_ROOTS) {
			expect(isUnprefixedPublicPath(`/${root}`)).toBe(true);
			expect(isUnprefixedPublicPath(`/${root}/nested`)).toBe(true);
		}
	});

	test("ignores paths that already carry a locale", () => {
		expect(isUnprefixedPublicPath("/en")).toBe(false);
		expect(isUnprefixedPublicPath("/en/reviews")).toBe(false);
		expect(isUnprefixedPublicPath("/id/reading-lists/cozy")).toBe(false);
	});

	test("ignores unsupported locales and non-public paths", () => {
		expect(isUnprefixedPublicPath("/fr/reviews")).toBe(false);
		expect(isUnprefixedPublicPath("/admin")).toBe(false);
		expect(isUnprefixedPublicPath("/api/reviews")).toBe(false);
		expect(isUnprefixedPublicPath("/feed.xml")).toBe(false);
		expect(isUnprefixedPublicPath("/sitemap.xml")).toBe(false);
	});
});

describe("localeSwitchHref", () => {
	test("swaps the segment and keeps the slug and depth", () => {
		expect(localeSwitchHref("/en/reviews/salt-and-paper", "id")).toBe(
			"/id/reviews/salt-and-paper",
		);
		expect(localeSwitchHref("/id", "en")).toBe("/en");
	});

	test("carries the query string with or without its leading question mark", () => {
		expect(localeSwitchHref("/en/reviews", "id", "sort=title&page=2")).toBe(
			"/id/reviews?sort=title&page=2",
		);
		expect(localeSwitchHref("/en/reviews", "id", "?q=dune")).toBe(
			"/id/reviews?q=dune",
		);
	});

	test("leaves no dangling question mark when there is no query", () => {
		expect(localeSwitchHref("/en/about", "id", "")).toBe("/id/about");
		expect(localeSwitchHref("/en/about", "id", "?")).toBe("/id/about");
	});
});

describe("localizedPaths", () => {
	test("gives one path per locale, in the supported order", () => {
		expect(localizedPaths("/reviews")).toEqual(["/en/reviews", "/id/reviews"]);
	});

	test("keeps slug and depth", () => {
		expect(localizedPaths("/reviews/salt-and-paper")).toEqual([
			"/en/reviews/salt-and-paper",
			"/id/reviews/salt-and-paper",
		]);
		expect(localizedPaths("/reading-lists/a/")).toEqual([
			"/en/reading-lists/a/",
			"/id/reading-lists/a/",
		]);
	});

	test("turns the root into a bare locale segment, not a trailing slash", () => {
		expect(localizedPaths("/")).toEqual(["/en", "/id"]);
		expect(localizedPaths("")).toEqual(["/en", "/id"]);
	});

	test("returns one path per supported locale", () => {
		expect(localizedPaths("/about")).toHaveLength(SUPPORTED_LOCALES.length);
	});
});

describe("constants", () => {
	test("serves exactly English and Indonesian", () => {
		expect(SUPPORTED_LOCALES).toEqual(["en", "id"]);
		expect(DEFAULT_LOCALE).toBe("en");
	});

	test("remembers the preference in the conventional cookie", () => {
		expect(LOCALE_COOKIE_NAME).toBe("NEXT_LOCALE");
	});

	test("the public roots are the pages that move under the locale segment", () => {
		expect(PUBLIC_PATH_ROOTS).toEqual(["reviews", "reading-lists", "about"]);
	});

	test("a locale is assignable to the shared app locale type", () => {
		const locale: Locale = "id";
		expect(locale).toBe("id");
	});
});
