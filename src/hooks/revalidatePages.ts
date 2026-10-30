import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { CollectionAfterChangeHook, Payload } from "payload";
import { env } from "../lib/env";
import { localizedPaths } from "../lib/i18n/locale";
import { logger } from "../lib/logger";
import {
	classifyPublishOutcome,
	verifyPublicVisibility,
} from "../lib/publish-verification";
import { getAdjacentReviews } from "../lib/review-navigation";

/**
 * The error `revalidatePath` throws when it runs outside a Next.js request
 * scope. It is the one failure the guard tolerates.
 */
const OUT_OF_SCOPE_INVARIANT = "Invariant: static generation store missing";

/** The fields the revalidation tail reads off a saved document. */
interface RevalidatedDocument {
	id: number | string;
	slug?: string | null;
	title?: string | null;
	publishDate?: string | null;
	createdAt?: string | null;
	_status?: string | null;
	publishAt?: string | null;
}

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
 * Schedules `work` to run after the response that produced the write.
 *
 * An `afterChange` hook runs *inside* the write's transaction, so anything it
 * awaits is part of that transaction: it holds the transaction's connection,
 * competes for a second one for every query of its own, and a failure rolls the
 * write back. Cache invalidation and the neighbour lookup are both of that
 * shape, and neither is the write. Deferring them past the response is what
 * keeps a publish from failing over work whose own failure means nothing.
 *
 * Not every caller has a request scope - a seed script, a script's Local API
 * write, a unit test - and there `after()` throws. Running the work inline
 * instead would put it straight back inside the transaction this function
 * exists to get it out of, so the omission is logged and the write left to
 * stand: a stale page is recoverable, a rolled-back publish is the incident.
 */
function deferPastResponse(work: () => Promise<void>, subject: string): void {
	try {
		after(work);
	} catch (error) {
		logger.warn(
			`[Revalidation] Could not defer revalidation for ${subject}: ${String(error)}`,
		);
	}
}

/**
 * Revalidates the pages of the reviews either side of `doc`.
 *
 * The neighbours' prev/next links point at this review (or stop pointing at it
 * after an unpublish), and they are cached under their own paths, so they lag
 * one ISR window without this. The lookup reuses the order the review pages use
 * (publishDate descending, slug tiebreak, visibility-gated) and costs two
 * bounded `limit: 1` queries. No neighbours is a safe no-op: a list end, a
 * missing slug, or a missing date yields nulls.
 *
 * The lookup is best effort. It is a cache warm-up of two neighbouring pages,
 * so a lookup that fails - the database unreachable, the pool exhausted - must
 * not undo a publish that has already been committed. The failure is classified
 * and logged; the paths that do not depend on it are still revalidated.
 */
async function revalidateNeighbourPages(
	payload: Payload | undefined,
	doc: RevalidatedDocument,
): Promise<void> {
	if (!payload) {
		return;
	}

	let adjacent: Awaited<ReturnType<typeof getAdjacentReviews>>;
	const startedAt = performance.now();
	try {
		adjacent = await getAdjacentReviews(payload, doc);
	} catch (error) {
		logger.warn("[Revalidation] Neighbour lookup failed; the write stands.", {
			kind: "neighbour_lookup_failed",
			slug: doc.slug ?? null,
			digest: failureDigest(error),
		});
		return;
	}

	warnOnSlowPooledRead(startedAt, `review "${doc.slug ?? doc.id}"`);

	for (const neighbour of [adjacent.newer, adjacent.older]) {
		if (neighbour) {
			revalidatePublicPath(`/reviews/${neighbour.slug}`);
		}
	}
}

/**
 * A short, log-safe identifier for a failure: Next.js's `digest` when the error
 * carries one, the message otherwise.
 */
function failureDigest(error: unknown): string {
	const digest = (error as { digest?: unknown } | null)?.digest;

	return typeof digest === "string" ? digest : String(error);
}

/**
 * Reports a pooled read that waited longer than `DB_POOL_SLOW_ACQUIRE_MS`.
 *
 * Payload's Postgres adapter builds its pool inside `postgresAdapter()` and only
 * exposes it as `payload.db.pool` once the instance is initialised, so there is
 * no supported seam to time a connection *acquisition* itself. The deferred
 * neighbour read is the read this phase owns, and it is the first thing to come
 * back slow when the pool is starved, so its elapsed time stands in for the
 * wait: past the threshold it is logged as one structured warning naming the
 * milliseconds spent, which is the signal the incident lacked.
 */
function warnOnSlowPooledRead(startedAt: number, subject: string): void {
	const elapsedMs = Math.round(performance.now() - startedAt);

	if (elapsedMs < env.DB_POOL_SLOW_ACQUIRE_MS) {
		return;
	}

	logger.warn(
		`[Database] Pooled read for ${subject} waited ${elapsedMs}ms; the pool may be starved.`,
		{
			kind: "db_pool_slow_acquire",
			subject,
			elapsedMs,
			thresholdMs: env.DB_POOL_SLOW_ACQUIRE_MS,
		},
	);
}

/**
 * Revalidates every cached page a published Review appears on.
 *
 * Runs after the response, so it must read nothing from the closed transaction:
 * the document it was handed is a plain object, and the neighbour lookup goes
 * through the Local API on its own connection.
 */
async function revalidateReviewPagesAfterWrite(
	doc: RevalidatedDocument,
	payload: Payload | undefined,
): Promise<void> {
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

	// Revalidate the neighbours' pages, last and best effort: their links are
	// the only thing here that needs a query, and the pages above do not.
	await revalidateNeighbourPages(payload, doc);

	// If featured status changed, homepage needs update (already covered above)
	// Reading lists that include this review will be revalidated by their own ISR
}

/**
 * Records what a published save left behind, and checks the public gate agrees.
 *
 * A save can commit and still leave a review a reader cannot open: a schedule
 * that has not arrived, or a publish that only looked successful. The first is
 * intentional, so it is recorded as one line of information - the `scheduled`
 * signal - rather than an error; the second is the incident this track exists
 * to report, once, with the slug, the locale and the id.
 *
 * Runs after the response like the revalidation above, and never throws: the
 * write is already committed, so this is a signal rather than a gate.
 */
async function verifyPublishedReview(
	doc: RevalidatedDocument,
	payload: Payload | undefined,
): Promise<void> {
	if (!payload || !doc.slug) {
		return;
	}

	const now = new Date();

	if (classifyPublishOutcome(doc, now) === "scheduled") {
		logger.info(
			`[Publish] Review "${doc.slug}" is published, scheduled for ${doc.publishAt}, and not public yet.`,
			{
				kind: "review_publish_scheduled",
				slug: doc.slug,
				publishAt: doc.publishAt ?? null,
			},
		);

		return;
	}

	await verifyPublicVisibility({
		doc,
		now,
		read: (query) => payload.find(query),
	});
}

/**
 * Revalidates cached pages when a Review is published or updated.
 * This ensures that ISR-cached pages show new content immediately.
 *
 * The hook itself returns the document untouched and awaits no I/O: the write
 * commits first, and the cached pages catch up afterwards.
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

		const payload = req?.payload;

		deferPastResponse(
			async () => {
				await revalidateReviewPagesAfterWrite(doc, payload);
				await verifyPublishedReview(doc, payload);
			},
			`review "${doc.slug ?? doc.id}"`,
		);
	}

	return doc;
};

/**
 * Revalidates every cached page a published Reading List appears on.
 */
async function revalidateReadingListPagesAfterWrite(
	doc: RevalidatedDocument,
): Promise<void> {
	// Revalidate the reading lists index page
	revalidatePublicPath("/reading-lists");

	// Revalidate the individual reading list page
	if (doc.slug) {
		revalidatePublicPath(`/reading-lists/${doc.slug}`);
	}

	// Revalidate homepage (featured reading lists)
	revalidatePublicPath("/");
}

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

		deferPastResponse(
			() => revalidateReadingListPagesAfterWrite(doc),
			`reading list "${doc.slug ?? doc.id}"`,
		);
	}

	return doc;
};
