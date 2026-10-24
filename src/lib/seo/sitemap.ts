import type { MetadataRoute } from "next";
import {
	DEFAULT_LOCALE,
	localizePath,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";

/** One logical page, before it is expanded into its per-locale URLs. */
export interface SitemapSource {
	/** The path without a locale segment, e.g. `/reviews/some-slug`. */
	path: string;
	lastModified: Date;
	changeFrequency: NonNullable<
		MetadataRoute.Sitemap[number]["changeFrequency"]
	>;
	priority: number;
}

/**
 * Expands logical pages into a sitemap that advertises both locales (`FR-8`).
 *
 * Each page yields one `<url>` per supported locale, and each of those names
 * the whole reciprocal set through `alternates.languages` — so a crawler
 * reading the Indonesian entry still learns where the English one is. The
 * `x-default` entry points at English, the locale the bare paths redirect to.
 */
export function buildSitemapEntries(
	sources: SitemapSource[],
	siteUrl: string,
): MetadataRoute.Sitemap {
	return sources.flatMap((source) => {
		const languages: Record<string, string> = {};

		for (const locale of SUPPORTED_LOCALES) {
			languages[locale] = `${siteUrl}${localizePath(source.path, locale)}`;
		}

		languages["x-default"] =
			`${siteUrl}${localizePath(source.path, DEFAULT_LOCALE)}`;

		return SUPPORTED_LOCALES.map((locale) => ({
			url: `${siteUrl}${localizePath(source.path, locale)}`,
			lastModified: source.lastModified,
			changeFrequency: source.changeFrequency,
			priority: source.priority,
			alternates: { languages },
		}));
	});
}
