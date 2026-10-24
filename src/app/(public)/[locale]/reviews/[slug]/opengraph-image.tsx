import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getPayload } from "payload";
import { OgImageFrame } from "@/components/og/OgImageFrame";
import { normalizeLocale } from "@/lib/i18n/locale";
import { buildReviewOgProps } from "@/lib/og-image";

export const revalidate = 60;

export const alt = "Review cover";
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
		collection: "reviews",
		where: {
			slug: { equals: slug },
			_status: { equals: "published" },
		},
		limit: 1,
		depth: 0,
		locale: appLocale,
	});

	const review = docs[0];
	if (!review) notFound();
	const props = buildReviewOgProps({
		title: review?.title ?? undefined,
		bookAuthor: review?.bookAuthor,
		rating: review?.rating,
	});

	return new ImageResponse(
		<OgImageFrame
			siteName={props.siteName}
			badge="Book Review"
			title={props.title}
			subtitle={`by ${props.author}`}
			rating={props.rating}
		/>,
		size,
	);
}
