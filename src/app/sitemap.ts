import configPromise from "@payload-config";
import type { MetadataRoute } from "next";
import { getPayload } from "payload";
import { buildSitemapEntries, type SitemapSource } from "@/lib/seo/sitemap";

// Depends on content that changes at runtime, so it cannot be pre-rendered at build.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const siteUrl =
		process.env.NEXT_PUBLIC_APP_URL || "https://chasing-chapters.com";
	const payload = await getPayload({ config: configPromise });

	const [reviews, readingLists] = await Promise.all([
		payload.find({
			collection: "reviews",
			where: {
				_status: {
					equals: "published",
				},
			},
			limit: 1000,
			select: {
				slug: true,
				updatedAt: true,
			},
		}),
		payload.find({
			collection: "reading-lists",
			where: {
				_status: {
					equals: "published",
				},
			},
			limit: 1000,
			select: {
				slug: true,
				updatedAt: true,
			},
		}),
	]);

	const now = new Date();

	const sources: SitemapSource[] = [
		{ path: "/", lastModified: now, changeFrequency: "daily", priority: 1 },
		{
			path: "/about",
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			path: "/reviews",
			lastModified: now,
			changeFrequency: "daily",
			priority: 0.9,
		},
		{
			path: "/reading-lists",
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		...reviews.docs.map((review) => ({
			path: `/reviews/${review.slug}`,
			lastModified: new Date(review.updatedAt),
			changeFrequency: "monthly" as const,
			priority: 0.8,
		})),
		...readingLists.docs.map((list) => ({
			path: `/reading-lists/${list.slug}`,
			lastModified: new Date(list.updatedAt),
			changeFrequency: "weekly" as const,
			priority: 0.6,
		})),
	];

	return buildSitemapEntries(sources, siteUrl);
}
