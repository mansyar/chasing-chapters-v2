/**
 * Locale resolution and reporting for the route error boundaries.
 *
 * The boundaries (`global-error`, `[locale]/error`) are client components, so
 * they cannot import the server-only dictionary. This module is the
 * client-safe companion: it resolves which locale an error page renders in,
 * carries the same four error strings for both locales (locked to the
 * dictionary by `error-locale.test.ts`), and reports to Sentry without ever
 * letting a reporting failure break rendering.
 */

import * as Sentry from "@sentry/nextjs";
import {
	DEFAULT_LOCALE,
	hasLocale,
	LOCALE_COOKIE_NAME,
	type Locale,
} from "./i18n/locale";

/**
 * The error-page strings, per locale.
 *
 * A client-safe mirror of the `error*` dictionary entries: the boundaries
 * read from here instead of importing the server dictionary into the client
 * bundle. The parity test fails if either side drifts.
 */
export interface ErrorCopy {
	title: string;
	description: string;
	tryAgain: string;
	home: string;
}

/** The error-page strings, per locale. Mirrors the `error*` dictionary keys. */
export const ERROR_COPY: Record<Locale, ErrorCopy> = {
	en: {
		title: "This Chapter Stumbled",
		description:
			"Something went wrong while turning this page. Try again — your place in the story is safe.",
		tryAgain: "Try Again",
		home: "Back Home",
	},
	id: {
		title: "Bab Ini Tersandung",
		description:
			"Terjadi kesalahan saat membuka halaman ini. Coba lagi — tempat Anda dalam cerita tetap aman.",
		tryAgain: "Coba Lagi",
		home: "Kembali ke Beranda",
	},
};

/**
 * Reads one cookie value from a raw `Cookie` header (or `document.cookie`).
 *
 * Pure over its inputs so the parsing stays unit-tested while the boundaries
 * stay thin; a missing, blank, or valueless cookie yields `null`.
 */
export function readCookieValue(
	header: string | null | undefined,
	name: string,
): string | null {
	if (!header) {
		return null;
	}

	for (const entry of header.split(";")) {
		const separator = entry.indexOf("=");
		const key = (separator < 0 ? entry : entry.slice(0, separator)).trim();

		if (key === name) {
			const value = (separator < 0 ? "" : entry.slice(separator + 1)).trim();
			return value === "" ? null : value;
		}
	}

	return null;
}

/**
 * Resolves the error-page locale from the browser's request-time signals.
 *
 * The remembered `NEXT_LOCALE` cookie wins, then the browser's accepted
 * languages, then English. Safe to call during server rendering, where the
 * browser signals do not exist yet and English is the only honest answer.
 */
export function resolveBrowserErrorLocale(): Locale {
	if (typeof document === "undefined" || typeof navigator === "undefined") {
		return DEFAULT_LOCALE;
	}

	return resolveErrorLocale({
		cookieLocale: readCookieValue(document.cookie, LOCALE_COOKIE_NAME),
		acceptLanguage: navigator.language,
	});
}

/**
 * The language ranges of an `Accept-Language` header, best first.
 *
 * Ranges without an explicit quality count as `q=1`; a refused (`q=0`) or
 * wildcard-only range is dropped, and an unusable header yields no ranges
 * rather than throwing.
 */
export function parseAcceptLanguage(
	header: string | null | undefined,
): string[] {
	if (!header) {
		return [];
	}

	const ranked = header
		.split(",")
		.map((part, order) => {
			const [rawTag, ...rawParams] = part.split(";");
			const tag = (rawTag ?? "").trim().toLowerCase();
			let quality = 1;

			for (const param of rawParams) {
				const match = param.trim().match(/^q=([0-9.]+)$/);

				if (match) {
					const parsed = Number.parseFloat(match[1] ?? "");
					quality = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 1);
				}
			}

			return { tag, quality, order };
		})
		.filter(
			(range) => range.tag !== "" && range.tag !== "*" && range.quality > 0,
		)
		.sort((a, b) => b.quality - a.quality || a.order - b.order);

	return ranked.map((range) => range.tag);
}

/**
 * Resolves the locale an error page renders in.
 *
 * The remembered `NEXT_LOCALE` cookie wins, then the request's accepted
 * languages (a region subtag matches its base language, so `id-ID` reads
 * Indonesian), then English. Nothing unusable ever throws — it falls through
 * to the next source.
 */
export function resolveErrorLocale(input: {
	cookieLocale?: string | null;
	acceptLanguage?: string | null;
}): Locale {
	if (hasLocale(input.cookieLocale)) {
		return input.cookieLocale;
	}

	for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
		const base = tag.split("-")[0];

		if (hasLocale(base)) {
			return base;
		}
	}

	return DEFAULT_LOCALE;
}

/**
 * Reports a caught boundary error to Sentry without blocking the UI.
 *
 * The call is fire-and-forget by construction: a Sentry outage throws inside
 * the `try`, the `catch` swallows it, and the error page renders regardless
 * (`AC-5`). Route context travels as event extra data, never into the UI.
 */
export function reportErrorToSentry(
	error: unknown,
	context?: { route?: string; locale?: Locale },
): void {
	try {
		Sentry.captureException(error, {
			extra: {
				route: context?.route ?? "unknown",
				locale: context?.locale ?? "unknown",
			},
		});
	} catch {
		// Reporting must never break rendering; the boundary already shows
		// its recovery UI, so there is nothing useful to do with this.
	}
}
