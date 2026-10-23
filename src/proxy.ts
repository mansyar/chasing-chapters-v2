import { type NextRequest, NextResponse } from "next/server";
import {
	hasLocale,
	isUnprefixedPublicPath,
	LOCALE_COOKIE_NAME,
	localizePath,
	resolveLocale,
} from "@/lib/i18n/locale";

/**
 * Paths the proxy never rewrites.
 *
 * `/admin` and `/api` are Payload's, `/robots.txt` and `/sitemap.xml` belong at
 * the root, and `/feed.xml` keeps serving English until the per-locale feed
 * exists. Static assets are covered by the matcher below and by the file
 * extension check, because a locale segment in front of a font or an image
 * would 404.
 */
const UNLOCALIZED_PREFIXES = ["/_next", "/api", "/admin"];

const UNLOCALIZED_PATHS = new Set([
	"/robots.txt",
	"/sitemap.xml",
	"/feed.xml",
	"/manifest.webmanifest",
]);

/** Whether a request is for something other than a public page. */
function isUnlocalizedPath(pathname: string): boolean {
	if (UNLOCALIZED_PATHS.has(pathname)) {
		return true;
	}

	// A file request (a font, an image, a favicon) never carries a locale.
	if (pathname.includes(".")) {
		return true;
	}

	return UNLOCALIZED_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

/**
 * Resolves the locale of a public request.
 *
 * The locale segment wins, then the remembered preference, then English, so a
 * shared `/id/...` link renders Indonesian for a reader whose preference is
 * English (`FR-2`).
 *
 * A legacy `?locale=` value redirects permanently to the path form and keeps
 * every other query parameter (`FR-7`). An unsupported value is dropped rather
 * than redirected to, because there is no page to send it to.
 */
export function proxy(request: NextRequest) {
	const { pathname, searchParams } = request.nextUrl;

	if (isUnlocalizedPath(pathname)) {
		return NextResponse.next();
	}

	const legacyLocale = searchParams.get("locale");

	if (hasLocale(legacyLocale)) {
		const url = request.nextUrl.clone();
		url.pathname = localizePath(pathname, legacyLocale);
		url.searchParams.delete("locale");

		return NextResponse.redirect(url, 308);
	}

	if (isUnprefixedPublicPath(pathname)) {
		const locale = resolveLocale({
			cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
		});
		const url = request.nextUrl.clone();
		url.pathname = localizePath(pathname, locale);

		// An unusable legacy value has nowhere to send the reader; drop it
		// while the path picks up its locale segment.
		if (legacyLocale !== null) {
			url.searchParams.delete("locale");
		}

		return NextResponse.redirect(url, 307);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		/*
		 * Everything except Next's own build output and the Payload admin's
		 * static files, which the checks above would pass through anyway.
		 */
		"/((?!_next/|favicon.ico).*)",
	],
};
