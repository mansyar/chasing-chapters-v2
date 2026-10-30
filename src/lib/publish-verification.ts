import type { Where } from "payload";

import { reportErrorToSentry } from "./error-locale";
import { DEFAULT_LOCALE, localizePath } from "./i18n/locale";
import { logger } from "./logger";
import {
	isPubliclyVisible,
	type PublishVisibilityDoc,
	publishedAndVisibleWhere,
} from "./publish-visibility";

/**
 * What a save left a review's public visibility as.
 *
 * The three answers are the whole vocabulary the publish path needs, and only
 * one of them is a failure:
 *
 * - `visible` - published and readable at `now`. The normal publish.
 * - `scheduled` - published, but `publishAt` has not arrived. Intentional and
 *   silent to readers; information, never an error.
 * - `not-published` - a draft, or any other state a reader cannot see. Deleting
 *   and unpublishing legitimately land here.
 *
 * There is deliberately no fourth "broken" answer. Whether a `visible` review
 * is *actually* readable is a database question, and {@link
 * classifyPublishOutcome} answers from memory alone so it stays pure.
 */
export type PublishOutcome = "visible" | "scheduled" | "not-published";

/**
 * Classifies a saved review without reading anything.
 *
 * The visibility decision itself is {@link isPubliclyVisible}, not a restatement
 * of it: a second copy of the rule is a second rule, and the publish path is
 * the one place that must agree with the pages. "Published but not visible"
 * therefore means exactly what it means for a reader - the schedule has not
 * arrived - which is the `scheduled` signal.
 */
export function classifyPublishOutcome(
	doc: PublishVisibilityDoc,
	now: Date,
): PublishOutcome {
	if (doc._status !== "published") {
		return "not-published";
	}

	return isPubliclyVisible(doc, now) ? "visible" : "scheduled";
}

/** The fields the post-response check reads off the saved document. */
export interface PublishVerificationDoc extends PublishVisibilityDoc {
	id: number | string;
	slug?: string | null;
}

/**
 * The read the check performs.
 *
 * It is the query the public review page issues: one document by slug, gated
 * by {@link publishedAndVisibleWhere}, with the collection's own access rules
 * in force - `overrideAccess: false` and no `user` - so "nothing came back"
 * means a reader's request would 404. `pagination: false` keeps it a single
 * query, as on the page.
 */
export interface PublicGateRead {
	collection: "reviews";
	where: Where;
	limit: number;
	depth: 0;
	overrideAccess: false;
	pagination: false;
}

/**
 * A `payload.find`-shaped read, injected rather than reached for.
 *
 * The check needs one read and no Payload instance, which keeps it testable
 * without a database and keeps the module free of an import cycle back to the
 * hook that calls it.
 */
export type PublicGateReader = (
	query: PublicGateRead,
) => Promise<{ docs?: readonly unknown[] }>;

/**
 * What the check concluded.
 *
 * `missing` is the only outcome that reports; `unreadable` means the read
 * itself failed, which is a pool or database problem rather than evidence that
 * the review is invisible.
 */
export type PublishVerificationOutcome =
	| "visible"
	| "missing"
	| "unreadable"
	| "skipped";

/**
 * Reads a just-published review through the public gate and reports it once
 * when it is not there.
 *
 * The incident this exists for is a publish that returned success and left
 * nothing readable behind it. The write has already committed by the time this
 * runs, so it never throws: a review that should be public and is not is
 * reported to Sentry with the slug, the locale and the id an operator needs,
 * and a read that fails is logged. Scheduled, draft and unpublished documents
 * are skipped - their invisibility is intended, not a failure - and so is a
 * review with no slug, which has no public URL to check.
 */
export async function verifyPublicVisibility({
	doc,
	now,
	read,
}: {
	doc: PublishVerificationDoc;
	now: Date;
	read: PublicGateReader;
}): Promise<PublishVerificationOutcome> {
	const slug = doc.slug;

	if (!slug || classifyPublishOutcome(doc, now) !== "visible") {
		return "skipped";
	}

	let found: readonly unknown[];
	try {
		const { docs } = await read({
			collection: "reviews",
			where: {
				and: [
					{
						slug: {
							equals: slug,
						},
					},
					publishedAndVisibleWhere(now),
				],
			},
			limit: 1,
			depth: 0,
			overrideAccess: false,
			pagination: false,
		});
		found = docs ?? [];
	} catch (error) {
		logger.warn(
			`[Publish] Could not verify "${slug}" through the public gate: ${String(error)}`,
			{ kind: "publish_verification_failed", slug },
		);

		return "unreadable";
	}

	if (found.length > 0) {
		return "visible";
	}

	reportErrorToSentry(
		new Error(
			`Review ${doc.id} "${slug}" is published but not publicly readable after the response.`,
		),
		{
			// The page a reader would have opened, in the default locale: the
			// incident query was per-locale, and one report per publish is the
			// contract, so the two locales are not reported twice.
			route: localizePath(`/reviews/${slug}`, DEFAULT_LOCALE),
			locale: DEFAULT_LOCALE,
		},
	);

	return "missing";
}
