import configPromise from "@payload-config";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getPayload } from "payload";
import { OgImageFrame } from "@/components/og/OgImageFrame";
import { buildReadingListOgProps } from "@/lib/og-image";

export const revalidate = 60;

export const alt = "Reading list cover";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const payload = await getPayload({ config: configPromise });

	const { docs } = await payload.find({
		collection: "reading-lists",
		where: {
			slug: { equals: slug },
			_status: { equals: "published" },
		},
		limit: 1,
		depth: 1,
	});

	const list = docs[0];
	if (!list) notFound();
	const bookCount = Array.isArray(list?.reviews) ? list.reviews.length : 0;
	const props = buildReadingListOgProps({
		title: list?.title,
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
