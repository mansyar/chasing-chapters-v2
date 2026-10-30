import {
	isPubliclyVisible,
	type PublishVisibilityDoc,
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
