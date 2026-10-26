import { revalidatePath } from "next/cache";
import type { CollectionAfterChangeHook } from "payload";
import { localizedPaths } from "../lib/i18n/locale";
import { logger } from "../lib/logger";
import { getAdjacentReviews } from "../lib/review-navigation";

/**
 * The error `revalidatePath` throws when it runs outside a Next.js request
 * scope. It is the one failure the guard tolerates.
 */
const OUT_OF_SCOPE_INVARIANT = "Invariant: static generation store missing";

/**
 * Revalidates a path, tolerating a missing request scope.
 *
 * `revalidatePath` only works inside a Next.js request scope. Outside one - a
 * local-API seed script, for example - it throws, and an uncaught throw in an
 * `afterChange` hook rolls the write back. Cache invalidation is a side effect
 * of the write, not the write itself, so that one failure is logged instead of
 * propagated.
 *
 * Every other failure is rethrown: a broken revalidation is a real error and
 * hiding it behind a log line would let a broken write look like a healthy
 * one.
 */
function safeRevalidatePath(path: string): void {
	try {
		revalidatePath(path);
	} catch (error) {
		if (!String(error).includes(OUT_OF_SCOPE_INVARIANT)) {
			throw error;
		}

		logger.warn(
			`[Revalidation] Could not revalidate "${path}": ${String(error)}`,
		);
	}
}

/**
 * Revalidates a public page in every locale it is rendered in.
 *
 * Public pages live under a locale segment, so a logical path (`/reviews`) is
 * two cached URLs (`/en/reviews`, `/id/reviews`) and both have to be named.
 */
function revalidatePublicPath(path: string): void {
	for (const localized of localizedPaths(path)) {
		safeRevalidatePath(localized);
	}
}

/**
 * Revalidates cached pages when a Review is published or updated.
 * This ensures that ISR-cached pages show new content immediately.
 */
export const revalidateReviewPages: CollectionAfterChangeHook = async ({
	doc,
	previousDoc,
	operation,
	req,
}) => {
	// Revalidate when:
	// 1. A new review is created and published
	// 2. An existing review is updated (status change, content change, featured toggle)
	const wasPublished = previousDoc?._status === "published";
	const isPublished = doc._status === "published";
	const justPublished = !wasPublished && isPublished;
	const wasUnpublished = wasPublished && !isPublished;
	const contentChanged = wasPublished && isPublished;

	if (
		justPublished ||
		wasUnpublished ||
		contentChanged ||
		operation === "create"
	) {
		logger.info(
			`[Revalidation] Review "${doc.title}" changed, revalidating pages...`,
		);

		// Revalidate the browse page
		revalidatePublicPath("/reviews");

		// Revalidate the individual review page
		if (doc.slug) {
			revalidatePublicPath(`/reviews/${doc.slug}`);
		}

		// Revalidate homepage (featured reviews, latest reviews)
		revalidatePublicPath("/");

		// Revalidate the RSS feeds (latest reviews), which exist once per locale.
		revalidatePublicPath("/feed.xml");

		// Revalidate the neighbours' pages. Their prev/next links point at
		// this review (or stop pointing at it after an unpublish), and they
		// are cached under their own paths, so they lag one ISR window
		// without this. The lookup reuses the order the review pages use
		// (publishDate descending, slug tiebreak, visibility-gated) and
		// costs two bounded `limit: 1` queries. No neighbours is a safe
		// no-op: a list end, a missing slug, or a missing date yields nulls.
		if (req?.payload) {
			const adjacent = await getAdjacentReviews(req.payload, doc);
			for (const neighbour of [adjacent.newer, adjacent.older]) {
				if (neighbour) {
					revalidatePublicPath(`/reviews/${neighbour.slug}`);
				}
			}
		}

		// If featured status changed, homepage needs update (already covered above)
		// Reading lists that include this review will be revalidated by their own ISR
	}

	return doc;
};

/**
 * Revalidates cached pages when a Reading List is published or updated.
 */
export const revalidateReadingListPages: CollectionAfterChangeHook = async ({
	doc,
	previousDoc,
	operation,
}) => {
	const wasPublished = previousDoc?._status === "published";
	const isPublished = doc._status === "published";
	const justPublished = !wasPublished && isPublished;
	const wasUnpublished = wasPublished && !isPublished;
	const contentChanged = wasPublished && isPublished;

	if (
		justPublished ||
		wasUnpublished ||
		contentChanged ||
		operation === "create"
	) {
		logger.info(
			`[Revalidation] Reading List "${doc.title}" changed, revalidating pages...`,
		);

		// Revalidate the reading lists index page
		revalidatePublicPath("/reading-lists");

		// Revalidate the individual reading list page
		if (doc.slug) {
			revalidatePublicPath(`/reading-lists/${doc.slug}`);
		}

		// Revalidate homepage (featured reading lists)
		revalidatePublicPath("/");
	}

	return doc;
};
