import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import { getPayload } from "payload";
import { buildRssFeed } from "@/lib/feed";
import {
	hasLocale,
	normalizeLocale,
	SUPPORTED_LOCALES,
} from "@/lib/i18n/locale";

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

	const { docs } = await payload.find({
		collection: "reviews",
		where: {
			_status: {
				equals: "published",
			},
		},
		sort: "-publishDate",
		limit: 20,
		depth: 1,
		locale: appLocale,
		select: {
			title: true,
			slug: true,
			publishDate: true,
			createdAt: true,
			reviewContent: true,
			coverImage: true,
		},
	});

	const xml = buildRssFeed({ reviews: docs, siteUrl, locale: appLocale });

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
}
