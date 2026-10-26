import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getDictionary } from "@/lib/i18n/dictionary";

// The module under test imports `@sentry/nextjs` at the top level, so the
// stub is registered before the dynamic import below hands back the real
// module surface under test.
const captureException = mock(() => undefined);

mock.module("@sentry/nextjs", () => ({ captureException }));

const {
	parseAcceptLanguage,
	readCookieValue,
	resolveBrowserErrorLocale,
	resolveErrorLocale,
	reportErrorToSentry,
	ERROR_COPY,
} = await import("../error-locale");

beforeEach(() => {
	captureException.mockClear();
});

describe("parseAcceptLanguage", () => {
	test("returns tags in header order when no quality values are given", () => {
		expect(parseAcceptLanguage("id, en")).toEqual(["id", "en"]);
	});

	test("orders by descending quality value", () => {
		expect(parseAcceptLanguage("en;q=0.8, id;q=0.9")).toEqual(["id", "en"]);
	});

	test("keeps region subtags and lowercases the header", () => {
		expect(parseAcceptLanguage("ID-ID, EN;q=0.5")).toEqual(["id-id", "en"]);
	});

	test("drops refused and wildcard-only ranges", () => {
		expect(parseAcceptLanguage("fr;q=0, *, id;q=0.7")).toEqual(["id"]);
	});

	test("returns an empty list for a missing or unusable header", () => {
		expect(parseAcceptLanguage(null)).toEqual([]);
		expect(parseAcceptLanguage(undefined)).toEqual([]);
		expect(parseAcceptLanguage("")).toEqual([]);
		expect(parseAcceptLanguage(";;;")).toEqual([]);
	});
});

describe("readCookieValue", () => {
	test("reads the named value from a cookie header", () => {
		const first = "NEXT_LOCALE=id; theme=dark";
		const second = "theme=dark; NEXT_LOCALE=en";

		expect(readCookieValue(first, "NEXT_LOCALE")).toBe("id");
		expect(readCookieValue(second, "NEXT_LOCALE")).toBe("en");
	});

	test("returns null for a missing, blank, or valueless cookie", () => {
		const blank = "NEXT_LOCALE=; theme=dark";

		expect(readCookieValue("theme=dark", "NEXT_LOCALE")).toBeNull();
		expect(readCookieValue(blank, "NEXT_LOCALE")).toBeNull();
		expect(readCookieValue("NEXT_LOCALE", "NEXT_LOCALE")).toBeNull();
		expect(readCookieValue(null, "NEXT_LOCALE")).toBeNull();
		expect(readCookieValue(undefined, "NEXT_LOCALE")).toBeNull();
		expect(readCookieValue("", "NEXT_LOCALE")).toBeNull();
	});
});

describe("resolveBrowserErrorLocale", () => {
	test("falls back to English without browser signals", () => {
		// bun:test has no document or navigator, which is exactly the
		// server-rendering path the boundaries take before hydration.
		expect(resolveBrowserErrorLocale()).toBe("en");
	});
});

describe("resolveErrorLocale", () => {
	test("prefers a usable cookie over the header", () => {
		expect(
			resolveErrorLocale({ cookieLocale: "en", acceptLanguage: "id" }),
		).toBe("en");
		expect(
			resolveErrorLocale({ cookieLocale: "id", acceptLanguage: "en" }),
		).toBe("id");
	});

	test("falls back to the header when the cookie is missing or unusable", () => {
		const staleCookie = { cookieLocale: "fr", acceptLanguage: "id" };
		const blankCookie = { cookieLocale: "", acceptLanguage: "id" };

		expect(resolveErrorLocale({ acceptLanguage: "id" })).toBe("id");
		expect(resolveErrorLocale(staleCookie)).toBe("id");
		expect(resolveErrorLocale(blankCookie)).toBe("id");
	});

	test("matches a region subtag to its supported base language", () => {
		expect(resolveErrorLocale({ acceptLanguage: "id-ID,id;q=0.9" })).toBe("id");
		expect(resolveErrorLocale({ acceptLanguage: "en-US" })).toBe("en");
	});

	test("prefers the highest-quality supported language", () => {
		const headers = { acceptLanguage: "en;q=0.8, id;q=0.9" };

		expect(resolveErrorLocale(headers)).toBe("id");
	});

	test("falls back to English when nothing is usable", () => {
		const unsupported = { cookieLocale: "fr", acceptLanguage: "de" };
		const blank = { cookieLocale: null, acceptLanguage: null };

		expect(resolveErrorLocale({})).toBe("en");
		expect(resolveErrorLocale(unsupported)).toBe("en");
		expect(resolveErrorLocale(blank)).toBe("en");
	});
});

describe("ERROR_COPY", () => {
	test("mirrors the dictionary entries so the client copy cannot drift", () => {
		for (const locale of ["en", "id"] as const) {
			const dictionary = getDictionary(locale);
			const copy = ERROR_COPY[locale];

			expect(copy.title).toBe(dictionary.errorTitle);
			expect(copy.description).toBe(dictionary.errorDescription);
			expect(copy.tryAgain).toBe(dictionary.errorTryAgain);
			expect(copy.home).toBe(dictionary.errorBackHome);
		}
	});

	test("every string is non-blank and the locales actually differ", () => {
		for (const locale of ["en", "id"] as const) {
			for (const value of Object.values(ERROR_COPY[locale])) {
				expect(value.trim()).not.toBe("");
			}
		}

		expect(ERROR_COPY.id.title).not.toBe(ERROR_COPY.en.title);
		expect(ERROR_COPY.id.description).not.toBe(ERROR_COPY.en.description);
	});
});

describe("reportErrorToSentry", () => {
	test("captures the error with route context", () => {
		const error = new Error("boom");

		reportErrorToSentry(error, { route: "/en/reviews", locale: "en" });

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({
				extra: expect.objectContaining({ route: "/en/reviews" }),
			}),
		);
	});

	test("a Sentry failure never breaks the caller", () => {
		captureException.mockImplementationOnce(() => {
			throw new Error("sentry is down");
		});

		expect(() =>
			reportErrorToSentry(new Error("boom"), { route: "global" }),
		).not.toThrow();
	});
});
