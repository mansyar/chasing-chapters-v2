import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { buildRssFeed } from "@/lib/feed";
import {
	hasLocale,
	normalizeLocale,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";

/**
 * The RSS 2.0 feed of one locale.
 *
 * It lives under the locale segment so the document's language, its item links
 * and the review text it carries are all the locale's own (`FR-9`). It sets no
 * layout-dependent markup, so it renders outside the document shell.
 */
export const revalidate = 3600;

/** Pre-renders one feed per locale. */
export function generateStaticParams() {
	return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ locale: string }> },
) {
	const { locale } = await params;

	if (!hasLocale(locale)) {
		notFound();
	}

	const appLocale = normalizeLocale(locale);
	const siteUrl =
		process.env.NEXT_PUBLIC_APP_URL || "https://chasing-chapters.com";
	const payload = await getPayload({ config: configPromise });
	// One clock reading for both the query and the in-memory rule beneath it,
	// so the two can never disagree about the moment.
	const now = new Date();

	const { docs } = await payload.find({
		collection: "reviews",
		where: publishedAndVisibleWhere(now),
		sort: "-publishDate",
		limit: 20,
		depth: 1,
		locale: appLocale,
		select: {
			title: true,
			slug: true,
			publishDate: true,
			publishAt: true,
			// The rule below reads the status off the document, so the query
			// has to return it even though the `where` already filters on it.
			_status: true,
			createdAt: true,
			reviewContent: true,
			coverImage: true,
		},
	});

	const xml = buildRssFeed({
		reviews: docs,
		siteUrl,
		locale: appLocale,
		now,
	});

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
}
