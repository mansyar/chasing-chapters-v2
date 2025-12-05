import type { MetadataRoute } from "next";
import configPromise from "@payload-config";
import { getPayload } from "payload";

// Generate sitemap at request time, not build time
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://chasing-chapters.com";

  const payload = await getPayload({ config: configPromise });

  // Fetch all published reviews
  const reviews = await payload.find({
    collection: "reviews",
    where: {
      _status: { equals: "published" },
    },
    limit: 1000,
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  // Fetch all reading lists
  const readingLists = await payload.find({
    collection: "reading-lists",
    limit: 1000,
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/reviews`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/reading-lists`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // Review pages
  const reviewPages: MetadataRoute.Sitemap = reviews.docs.map((review) => ({
    url: `${siteUrl}/reviews/${review.slug}`,
    lastModified: new Date(review.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  // Reading list pages
  const readingListPages: MetadataRoute.Sitemap = readingLists.docs.map(
    (list) => ({
      url: `${siteUrl}/reading-lists/${list.slug}`,
      lastModified: new Date(list.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })
  );

  return [...staticPages, ...reviewPages, ...readingListPages];
}
