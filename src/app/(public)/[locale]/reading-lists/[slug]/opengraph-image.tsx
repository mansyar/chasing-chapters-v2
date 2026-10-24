import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getPayload } from "payload";
import { OgImageFrame } from "@/components/og/OgImageFrame";
import { normalizeLocale } from "@/lib/i18n/locale";
import { buildReadingListOgProps } from "@/lib/og-image";
import { isPubliclyVisible } from "@/lib/publish-visibility";

export const revalidate = 60;

export const alt = "Reading list cover";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>;
}) {
	const { locale, slug } = await params;
	const appLocale = normalizeLocale(locale);
	const payload = await getPayload({ config: configPromise });

	const { docs } = await payload.find({
		collection: "reading-lists",
		where: {
			slug: { equals: slug },
			_status: { equals: "published" },
		},
		limit: 1,
		depth: 1,
		locale: appLocale,
	});

	const list = docs[0];
	if (!list) notFound();
	// The list is read at `depth: 1`, so `reviews` arrives populated and the
	// shared rule can judge each document. Counting through the same rule the
	// detail page renders with keeps the image's "N books" equal to the cards
	// on that page; an unpopulated id cannot be judged, so it is kept rather
	// than dropped (`FR-5`).
	const now = new Date();
	const bookCount = (Array.isArray(list.reviews) ? list.reviews : []).filter(
		(review) => typeof review === "number" || isPubliclyVisible(review, now),
	).length;
	const props = buildReadingListOgProps({
		title: list?.title ?? undefined,
		bookCount,
	});

	return new ImageResponse(
		<OgImageFrame
			siteName={props.siteName}
			badge={props.subtitle}
			title={props.title}
			subtitle={`${props.bookCount} ${props.bookCount === 1 ? "book" : "books"}`}
		/>,
		size,
	);
}
