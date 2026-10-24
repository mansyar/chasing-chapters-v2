import type { Locale } from "../../src/lib/i18n/locale";

/**
 * Locale-explicit URLs for the browser suite.
 *
 * Every public page is served under `/en` or `/id`, so a spec that navigates to
 * a bare path is exercising the redirect rather than the page. The helpers
 * below build the URL the page is actually served at, and the fixture path for
 * a given locale.
 */
export function localePath(path: string, locale: Locale = "en"): string {
	if (path === "/" || path === "") {
		return `/${locale}`;
	}

	return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}
