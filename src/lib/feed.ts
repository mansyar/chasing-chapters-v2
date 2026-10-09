import { resolveMediaUrl } from "./media-url";
import { extractTextFromRichText } from "./utils";

/**
 * RSS 2.0 feed builder for published reviews.
 *
 * Pure functions only: the /feed.xml route handler supplies reviews from the
 * local Payload API and a canonical site URL, and this module turns them into
 * the final XML document. Keeping the mapping, escaping and limiting here
 * makes the feed testable without a database or HTTP layer.
 */

/** Maximum number of reviews included in the feed (latest first). */
export const FEED_ITEM_LIMIT = 20;

/** Maximum length of an item's plain-text excerpt, excluding the ellipsis. */
const EXCERPT_MAX_LENGTH = 300;

export interface FeedReview {
	title?: string | null;
	slug?: string | null;
	publishDate?: string | null;
	createdAt?: string | null;
	_status?: string | null;
	reviewContent?: unknown;
	coverImage?: unknown;
}

export interface RssFeedOptions {
	reviews: FeedReview[];
	siteUrl: string;
}

/** Escape a string for safe inclusion in XML text nodes and attributes. */
export function escapeXml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** Format a date as an RFC 822 date-time (e.g. "Thu, 15 Jan 2026 00:00:00 GMT"). */
export function rfc822(date: Date | string): string {
	return new Date(date).toUTCString();
}

/**
 * Derive a plain-text excerpt from a review's rich text content.
 * Collapses whitespace and truncates on a word boundary with an ellipsis.
 */
export function getReviewExcerpt(
	richText: unknown,
	maxLength: number = EXCERPT_MAX_LENGTH,
): string {
	const text = extractTextFromRichText(richText).replace(/\s+/g, " ").trim();
	if (text.length <= maxLength) return text;

	const truncated = text.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

/** Build the RSS `<item>` XML for a single review. */
function buildItemXml(review: FeedReview, siteUrl: string): string {
	const link = `${siteUrl}/reviews/${review.slug}`;
	const pubDate = rfc822(review.publishDate ?? review.createdAt ?? new Date());
	const excerpt = getReviewExcerpt(review.reviewContent);
	const cover = review.coverImage as
		| { url?: string | null; alt?: string | null }
		| number
		| null
		| undefined;
	const coverImage = cover && typeof cover === "object" ? cover : undefined;

	let description = excerpt ? escapeXml(excerpt) : "";
	if (coverImage?.url) {
		const alt = coverImage.alt ? ` alt="${escapeXml(coverImage.alt)}"` : "";
		// HTML in <description> must not become child elements of the XML node;
		// wrap it in CDATA so readers treat it as markup, per the RSS 2.0 spec.
		const img = `<img src="${escapeXml(resolveMediaUrl(coverImage.url) ?? "")}"${alt} />`;
		const body = excerpt ? `<p>${escapeXml(excerpt)}</p>` : "";
		description = `<![CDATA[${img}${body}]]>`;
	}

	return [
		"\t\t<item>",
		`\t\t\t<title>${escapeXml(review.title ?? "Untitled")}</title>`,
		`\t\t\t<link>${escapeXml(link)}</link>`,
		`\t\t\t<guid isPermaLink="true">${escapeXml(link)}</guid>`,
		`\t\t\t<pubDate>${pubDate}</pubDate>`,
		`\t\t\t<description>${description}</description>`,
		"\t\t</item>",
	].join("\n");
}

/** Build the complete RSS 2.0 XML document for a set of reviews. */
export function buildRssFeed({ reviews, siteUrl }: RssFeedOptions): string {
	const published = reviews.filter(
		(review) =>
			(!review._status || review._status === "published") && review.slug,
	);
	const latest = published
		.toSorted((a, b) => {
			const aDate = new Date(a.publishDate ?? a.createdAt ?? 0).getTime();
			const bDate = new Date(b.publishDate ?? b.createdAt ?? 0).getTime();
			return bDate - aDate;
		})
		.slice(0, FEED_ITEM_LIMIT);

	const items = latest.map((review) => buildItemXml(review, siteUrl));

	return [
		`<?xml version="1.0" encoding="UTF-8"?>`,
		`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
		"\t<channel>",
		"\t\t<title>Chasing Chapters</title>",
		`\t\t<link>${escapeXml(siteUrl)}</link>`,
		"\t\t<description>Book reviews, reading lists, and literary notes from Chasing Chapters.</description>",
		"\t\t<language>en</language>",
		`\t\t<lastBuildDate>${rfc822(new Date())}</lastBuildDate>`,
		`\t\t<atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
		...items,
		"\t</channel>",
		"</rss>",
	].join("\n");
}
