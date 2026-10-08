/**
 * Pure prop builders for dynamically generated Open Graph images.
 *
 * The `opengraph-image.tsx` routes (`reviews/[slug]`, `reading-lists/[slug]`)
 * render these props with Next.js `ImageResponse`. Keeping the logic pure
 * allows it to be unit tested without invoking the image renderer.
 */

export const OG_IMAGE_MAX_TITLE_LENGTH = 80;
export const OG_IMAGE_MAX_AUTHOR_LENGTH = 60;

export const OG_IMAGE_SITE_NAME = "Chasing Chapters";

/** Truncate text to `max` characters, appending an ellipsis when truncated. */
export function truncate(
	text: string | undefined,
	max: number,
	fallback = "",
): string {
	if (!text) return fallback;
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1)}…`;
}

/**
 * Clamp a star rating into the 1–5 range. Returns 0 when the rating is
 * missing or invalid so the renderer can hide the star row entirely.
 */
export function clampRating(rating: number | undefined): number {
	if (rating === undefined || Number.isNaN(rating)) return 0;
	return Math.min(5, Math.max(1, Math.round(rating)));
}

export interface ReviewOgProps {
	title: string;
	author: string;
	rating: number;
	siteName: string;
}

/** Build display props for a review detail OG image. */
export function buildReviewOgProps(review: {
	title?: string;
	bookAuthor?: string;
	rating?: number;
}): ReviewOgProps {
	return {
		title: truncate(review.title, OG_IMAGE_MAX_TITLE_LENGTH, "Untitled Review"),
		author: truncate(
			review.bookAuthor,
			OG_IMAGE_MAX_AUTHOR_LENGTH,
			"Unknown Author",
		),
		rating: clampRating(review.rating),
		siteName: OG_IMAGE_SITE_NAME,
	};
}

export interface ReadingListOgProps {
	title: string;
	subtitle: string;
	bookCount: number;
	siteName: string;
}

/** Build display props for a reading-list detail OG image. */
export function buildReadingListOgProps(list: {
	title?: string;
	bookCount?: number;
}): ReadingListOgProps {
	return {
		title: truncate(
			list.title,
			OG_IMAGE_MAX_TITLE_LENGTH,
			"Untitled Reading List",
		),
		subtitle: "Reading List",
		bookCount: list.bookCount ?? 0,
		siteName: OG_IMAGE_SITE_NAME,
	};
}
