/**
 * Locale routing.
 *
 * The public site is served under a locale segment (`/en/...`, `/id/...`), so
 * every request needs two answers before it reaches a page: which locale it is
 * asking for, and what that locale's path looks like. Both are pure functions
 * so the proxy stays a thin adapter and the unit tests can drive the rules
 * (`NFR-4`) without a running Next.js server.
 */

/**
 * The locales the public site is served in.
 *
 * Order matters only for display; English is the fallback everywhere.
 */
export const SUPPORTED_LOCALES = ["en", "id"] as const;

/** A locale the public site can be rendered in. */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** The locale an unprefixed request resolves to when nothing else is known. */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * The cookie that remembers a reader's language choice.
 *
 * Phase 1 only reads it; the language control writes it when the reader
 * chooses a language.
 */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/**
 * The first path segment of every public page.
 *
 * The proxy decides "is this an unprefixed public path" by testing against this
 * list rather than by excluding everything else, so a path with an unsupported
 * locale segment (`/fr/reviews`) reaches Next.js and 404s instead of being
 * rewritten into `/en/fr/reviews`.
 */
export const PUBLIC_PATH_ROOTS = ["reviews", "reading-lists", "about"] as const;

/** Whether a value is one of the supported locales. */
export function hasLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" &&
		(SUPPORTED_LOCALES as readonly string[]).includes(value)
	);
}

/**
 * Narrows an arbitrary value to a supported locale.
 *
 * Anything unrecognised — a missing value, a hand-edited query parameter, a
 * stale cookie — resolves to English rather than reaching Payload, which is
 * what `FR-11` asks for.
 */
export function normalizeLocale(value: unknown): Locale {
	return hasLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Resolves the locale for a request.
 *
 * The path wins over the cookie so a shared `/id/...` link renders Indonesian
 * for a reader whose preference is English, and an unusable cookie value falls
 * back to English instead of erroring (`FR-2`).
 */
export function resolveLocale(input: {
	pathLocale?: string | null;
	cookieLocale?: string | null;
}): Locale {
	if (hasLocale(input.pathLocale)) {
		return input.pathLocale;
	}

	return normalizeLocale(input.cookieLocale);
}

/**
 * Returns `pathname` with its locale segment set to `locale`.
 *
 * A supported locale in the first segment is swapped, so `/en/reviews/x` keeps
 * its slug and depth on the way to `/id/reviews/x`; anything else gains the
 * segment in front. `/` becomes `/en` rather than `/en/`.
 */
export function localizePath(pathname: string, locale: Locale): string {
	if (pathname === "" || pathname === "/") {
		return `/${locale}`;
	}

	const segments = pathname.split("/");

	if (hasLocale(segments[1])) {
		segments[1] = locale;
		return segments.join("/");
	}

	segments.splice(1, 0, locale);
	return segments.join("/");
}

/**
 * The href that shows `pathname` in `locale`, query string included.
 *
 * The language control has to keep `?q=`, `?genre=`, `?sort=` and `?page=`
 * while it swaps the segment (`FR-3`), so the query is carried separately:
 * `search` is what `URLSearchParams.toString()` or `window.location.search`
 * gives, with or without the leading `?`. An empty query yields a clean URL
 * with no dangling `?`.
 */
export function localeSwitchHref(
	pathname: string,
	locale: Locale,
	search = "",
): string {
	const target = localizePath(pathname, locale);
	const query = search.replace(/^\?/, "");

	return query ? `${target}?${query}` : target;
}

/** The locale segment of a pathname, when it has a supported one. */
export function pathLocale(pathname: string): Locale | null {
	const segment = pathname.split("/")[1];

	return hasLocale(segment) ? segment : null;
}

/**
 * Every rendered URL for a logical public path, one per locale.
 *
 * A public page exists once per locale (`FR-12`), and ISR caches are keyed by
 * path, so invalidating a page means naming each locale's URL. Callers pass the
 * path as written in a link (`/reviews`, `/reviews/<slug>`, `/`) and get
 * `/en/...` and `/id/...` back, built with `localizePath` so the rules stay in
 * one place.
 */
export function localizedPaths(pathname: string): string[] {
	return SUPPORTED_LOCALES.map((locale) => localizePath(pathname, locale));
}

/**
 * Whether a pathname is a public page that still needs its locale segment.
 *
 * `/` and the public roots (`/reviews`, `/reading-lists`, `/about`) qualify.
 * A path that already starts with a supported locale, an unsupported locale
 * segment, and every non-public prefix (`/admin`, `/api`, `/feed.xml`) do not.
 */
export function isUnprefixedPublicPath(pathname: string): boolean {
	if (pathname === "/") {
		return true;
	}

	const first = pathname.split("/").filter(Boolean)[0];

	return (
		first !== undefined &&
		(PUBLIC_PATH_ROOTS as readonly string[]).includes(first)
	);
}
