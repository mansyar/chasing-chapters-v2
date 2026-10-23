import { getDictionary } from "@/lib/i18n/dictionary";
import { type Locale, localizePath } from "@/lib/i18n/locale";
import { resolveMediaUrl } from "@/lib/media-url";
import type { Media, Review } from "@/payload-types";

export const SITE_URL =
	process.env.NEXT_PUBLIC_APP_URL || "https://chasing-chapters.com";

// WebSite schema for the document shell of one locale
export function generateWebSiteSchema(locale: Locale) {
	const dictionary = getDictionary(locale);

	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${SITE_URL}${localizePath("/", locale)}/#website`,
		name: dictionary.metaSiteName,
		url: `${SITE_URL}${localizePath("/", locale)}`,
		description: dictionary.metaHomeDescription,
		inLanguage: locale,
		potentialAction: {
			"@type": "SearchAction",
			target: `${SITE_URL}${localizePath("/reviews", locale)}?q={search_term_string}`,
			"query-input": "required name=search_term_string",
		},
	};
}

// Book + Review schema for review detail pages
//
// `reviewBody` is deliberately absent: the only text available without
// translating anything is a synthetic English sentence, and emitting it on an
// Indonesian page would describe the page in the wrong language. The rating,
// the book and the author carry the same structured meaning without it.
export function generateReviewSchema(
	review: Review,
	locale: Locale,
	coverImage?: Media,
) {
	const reviewUrl = `${SITE_URL}${localizePath(`/reviews/${review.slug}`, locale)}`;

	return {
		"@context": "https://schema.org",
		"@type": "Review",
		"@id": `${reviewUrl}/#review`,
		name: review.title,
		inLanguage: locale,
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
			"@id": `${reviewUrl}/#book`,
			name: review.title,
			inLanguage: locale,
			author: {
				"@type": "Person",
				name: review.bookAuthor,
			},
			...(coverImage?.url && { image: resolveMediaUrl(coverImage.url) }),
		},
		publisher: {
			"@type": "Organization",
			name: getDictionary(locale).metaSiteName,
			url: SITE_URL,
		},
	};
}

// Breadcrumb schema
export function generateBreadcrumbSchema(
	items: { name: string; url: string }[],
	locale: Locale,
) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		"@id": `${SITE_URL}${localizePath("/", locale)}/#breadcrumb`,
		inLanguage: locale,
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
	locale: Locale,
) {
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		"@id": `${SITE_URL}${localizePath("/", locale)}/#itemlist`, // Ideally unique per list type, but good start
		name: listName,
		inLanguage: locale,
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
