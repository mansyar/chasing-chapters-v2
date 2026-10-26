import type { Payload, Where } from "payload";

import { type AppLocale } from "./date-format";
import { publishedAndVisibleWhere } from "./publish-visibility";

/**
 * One adjacent review, reduced to what a link needs.
 */
export interface ReviewNeighbour {
	slug: string;
	title: string | null;
}

export interface ReviewNavigation {
	/** The review that comes immediately after this one in reading order. */
	newer: ReviewNeighbour | null;
	/** The review that comes immediately before this one in reading order. */
	older: ReviewNeighbour | null;
}

/** The fields the helper reads off the review it is finding neighbours for. */
interface NavigationReview {
	id: number | string;
	slug?: string | null;
	publishDate?: string | null;
	createdAt?: string | null;
}

interface GetAdjacentReviewsOptions {
	locale?: AppLocale;
}

function toNeighbour(
	doc: { slug?: string | null; title?: string | null } | undefined,
): ReviewNeighbour | null {
	if (!doc?.slug) {
		return null;
	}

	return { slug: doc.slug, title: doc.title ?? null };
}

/**
 * The two reviews adjacent to `review` in the order the review index uses:
 * `publishDate` descending, with the slug ascending as the tiebreak.
 *
 * "Newer" is therefore the nearest review *above* this one in that list —
 * either a later `publishDate`, or the same date and a smaller slug — and
 * "older" is the mirror. Both sides are found by their own bounded query
 * (`limit: 1` with a two-field sort), so this costs two reads regardless of
 * how many reviews exist, rather than loading a window and scanning it.
 *
 * Visibility is the same gate every public page uses, so a draft or a review
 * scheduled for the future is never a neighbour. There is no wrap-around: at
 * either end of the list the corresponding side is `null`, and a review with
 * no slug or no date has no neighbours at all.
 *
 * A published review whose `publishDate` is null (pre-back-fill data) does not
 * participate: date comparisons do not match a null column. Publishing
 * back-fills `publishDate`, so this only affects rows that predate that.
 */
export async function getAdjacentReviews(
	payload: Payload,
	review: NavigationReview,
	options: GetAdjacentReviewsOptions = {},
): Promise<ReviewNavigation> {
	const slug = review.slug;
	const anchor = review.publishDate ?? review.createdAt;

	if (!slug || !anchor) {
		return { newer: null, older: null };
	}

	const visible = publishedAndVisibleWhere(new Date());
	const notSelf: Where = { id: { not_equals: review.id } };

	const newerWhere: Where = {
		and: [
			visible,
			notSelf,
			{
				or: [
					{ publishDate: { greater_than: anchor } },
					{
						and: [
							{ publishDate: { equals: anchor } },
							{ slug: { less_than: slug } },
						],
					},
				],
			},
		],
	};

	const olderWhere: Where = {
		and: [
			visible,
			notSelf,
			{
				or: [
					{ publishDate: { less_than: anchor } },
					{
						and: [
							{ publishDate: { equals: anchor } },
							{ slug: { greater_than: slug } },
						],
					},
				],
			},
		],
	};

	const [newerResult, olderResult] = await Promise.all([
		payload.find({
			collection: "reviews",
			where: newerWhere,
			sort: ["publishDate", "-slug"],
			limit: 1,
			depth: 0,
			select: { slug: true, title: true },
			locale: options.locale,
		}),
		payload.find({
			collection: "reviews",
			where: olderWhere,
			sort: ["-publishDate", "slug"],
			limit: 1,
			depth: 0,
			select: { slug: true, title: true },
			locale: options.locale,
		}),
	]);

	return {
		newer: toNeighbour(newerResult.docs[0]),
		older: toNeighbour(olderResult.docs[0]),
	};
}
