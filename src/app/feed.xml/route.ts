import configPromise from "@payload-config";
import { getPayload } from "payload";
import { buildRssFeed } from "@/lib/feed";

// Rebuild the feed at most once per hour; individual reviews are already
// revalidated on demand via the revalidatePages hook.
export const revalidate = 3600;

export async function GET() {
	const siteUrl =
		process.env.NEXT_PUBLIC_APP_URL || "https://chasing-chapters.com";

	const payload = await getPayload({ config: configPromise });

	const { docs } = await payload.find({
		collection: "reviews",
		where: {
			_status: { equals: "published" },
		},
		sort: "-publishDate",
		limit: 20,
		depth: 1,
		select: {
			title: true,
			slug: true,
			publishDate: true,
			createdAt: true,
			reviewContent: true,
			coverImage: true,
		},
	});

	const xml = buildRssFeed({ reviews: docs, siteUrl });

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
}
