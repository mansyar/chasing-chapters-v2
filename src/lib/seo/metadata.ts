import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/dictionary";
import {
	DEFAULT_LOCALE,
	type Locale,
	localizePath,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";
import { SITE_URL } from "./structured-data";

/**
 * Locale-aware page metadata (`FR-5`, `FR-6`, `NFR-3`).
 *
 * Every public page owns its own metadata for the locale it is served in:
 * a self-referencing canonical, the reciprocal hreflang set, and Open Graph
 * values in the locale's language. The root layout can only be a default —
 * it renders before the locale segment is known — so anything that claims to
 * describe a page is built here, from the page's own path.
 */

/** The `og:locale` value of each supported locale. */
const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
	en: "en_US",
	id: "id_ID",
};

/** The locale each other locale advertises as its alternate. */
function otherLocale(locale: Locale): Locale {
	return locale === "en" ? "id" : "en";
}

/** The site-wide Open Graph image, next to the pages so it resolves against `metadataBase`. */
const OPEN_GRAPH_IMAGE = {
	url: "/og-image.jpg",
	width: 1200,
	height: 630,
} as const;

/**
 * The absolute URL of a logical path in a locale.
 *
 * Absolute because hreflang and canonical values are required to be, and
 * because a crawler reading the sitemap or a feed has no base URL to resolve
 * a relative one against.
 */
export function absoluteLocaleUrl(path: string, locale: Locale): string {
	return `${SITE_URL}${localizePath(path, locale)}`;
}

/**
 * The reciprocal hreflang set for a logical path.
 *
 * Every supported locale points at its own path-based URL, and `x-default`
 * points at English — the locale the bare paths redirect to (`FR-6`).
 */
export function localeLanguageAlternates(path: string): Record<string, string> {
	const languages: Record<string, string> = {};

	for (const locale of SUPPORTED_LOCALES) {
		languages[locale] = absoluteLocaleUrl(path, locale);
	}

	languages["x-default"] = absoluteLocaleUrl(path, DEFAULT_LOCALE);

	return languages;
}

/** What a page tells this module about itself. */
export interface PageMetadataInput {
	/** The locale the page is being rendered in. */
	locale: Locale;
	/** The logical path without a locale segment, e.g. `/reviews/some-slug`. */
	path: string;
	/** The page title, already localized. */
	title: string;
	/** The page description, already localized. */
	description: string;
	/** `article` for a review, `website` for everything else. */
	openGraphType?: "website" | "article";
}

/**
 * Builds the metadata of one public page in one locale.
 *
 * The canonical is the page's own locale-prefixed URL, never the unprefixed
 * one: `/en/reviews/<slug>` and `/id/reviews/<slug>` are two pages with two
 * contents, so each has to name itself.
 */
export function buildPageMetadata({
	locale,
	path,
	title,
	description,
	openGraphType = "website",
}: PageMetadataInput): Metadata {
	const dictionary = getDictionary(locale);
	const canonical = absoluteLocaleUrl(path, locale);
	const feed = absoluteLocaleUrl("/feed.xml", locale);

	return {
		title,
		description,
		alternates: {
			canonical,
			languages: localeLanguageAlternates(path),
			types: {
				"application/rss+xml": feed,
			},
		},
		openGraph: {
			type: openGraphType,
			title,
			description,
			url: canonical,
			siteName: dictionary.metaSiteName,
			locale: OPEN_GRAPH_LOCALES[locale],
			alternateLocale: [OPEN_GRAPH_LOCALES[otherLocale(locale)]],
			images: [{ ...OPEN_GRAPH_IMAGE, alt: dictionary.metaOgImageAlt }],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

/**
 * The metadata a locale's document shell contributes.
 *
 * The root layout cannot know the locale, so its `og:locale` is English. A
 * page that overrides `openGraph` replaces that value; this keeps the shell
 * itself correct for the pages that do not (the 404s, which set no Open Graph
 * values of their own).
 */
export function buildLocaleShellMetadata(locale: Locale): Metadata {
	return {
		alternates: {
			types: {
				"application/rss+xml": absoluteLocaleUrl("/feed.xml", locale),
			},
		},
		openGraph: {
			locale: OPEN_GRAPH_LOCALES[locale],
			alternateLocale: [OPEN_GRAPH_LOCALES[otherLocale(locale)]],
		},
	};
}
