import type { Review, Media } from "@/payload-types";

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://chasing-chapters.com";
const SITE_NAME = "Chasing Chapters";

// WebSite schema for homepage
export function generateWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "A digital sanctuary for book lovers, dedicated to the art of storytelling.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/reviews?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

// Book + Review schema for review detail pages
export function generateReviewSchema(review: Review, coverImage?: Media) {
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    "@id": `${SITE_URL}/reviews/${review.slug}/#review`,
    name: review.title,
    reviewBody: `Read our comprehensive review of ${review.title} by ${review.bookAuthor}. A deep dive into the characters, plot, and emotional resonance of this ${review.genres && Array.isArray(review.genres) && typeof review.genres[0] === "object" ? (review.genres[0] as { name?: string }).name : "story"}.`,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    datePublished: review.publishDate || review.createdAt,
    author: {
      "@type": "Person",
      name: (review.author as { name?: string })?.name || "Chasing Chapters",
    },
    itemReviewed: {
      "@type": "Book",
      "@id": `${SITE_URL}/reviews/${review.slug}/#book`,
      name: review.title,
      author: {
        "@type": "Person",
        name: review.bookAuthor,
      },
      ...(coverImage?.url && { image: coverImage.url }),
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
}

// Breadcrumb schema
export function generateBreadcrumbSchema(
  items: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${SITE_URL}/#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ItemList schema for listing pages
export function generateItemListSchema(
  items: { name: string; url: string; image?: string }[],
  listName: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/#itemlist`, // Ideally unique per list type, but good start
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: item.url,
      name: item.name,
      ...(item.image && { image: item.image }),
    })),
  };
}
