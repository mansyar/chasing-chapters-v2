/**
 * How the reviews admin describes a review's publish state (`FR-7`, `AC-7`).
 *
 * Two surfaces ask the same question - the list cell and the edit-view notice -
 * so the answer is derived here, once, from the two fields the public gate
 * reads: `_status` and `publishAt`. Nothing in this module imports React, the
 * payload client or a database, so the derivation is unit-testable without a
 * browser and both surfaces cannot drift apart.
 *
 * The rule mirrors `src/lib/publish-visibility.ts` deliberately:
 *
 * - not published → `draft`, whatever the schedule says (a scheduled draft is
 *   still a draft to readers, which is the spec's own edge case);
 * - published with a `publishAt` in the future → `scheduled`;
 * - anything else → `live`, including an unreadable `publishAt`, which the
 *   visibility module also treats as "no schedule".
 */

/** The three states the admin shows. */
export type ReviewPublishState = "scheduled" | "live" | "draft";

/** The word the list cell shows for each state. */
export const REVIEW_PUBLISH_STATE_LABELS: Record<ReviewPublishState, string> = {
	scheduled: "Scheduled",
	live: "Live",
	draft: "Draft",
};

/**
 * The slice of a review these helpers read.
 *
 * Typed `unknown` rather than `string` because both surfaces are handed
 * untyped form/document data by Payload; the readers below narrow instead of
 * asserting.
 */
export interface ReviewPublishDoc {
	_status?: unknown;
	publishAt?: unknown;
}

/** The document status, when it is a string. */
function readDocumentStatus(doc: ReviewPublishDoc | null | undefined): string {
	const status = doc?._status;
	return typeof status === "string" ? status : "";
}

/** The schedule as stored, when it is a string. */
function readPublishAt(doc: ReviewPublishDoc | null | undefined): string {
	const publishAt = doc?.publishAt;
	return typeof publishAt === "string" ? publishAt : "";
}

/**
 * The instant the review is scheduled for, or `null` when there is no usable
 * schedule (unset, empty or unparsable).
 */
export function scheduledMoment(
	doc: ReviewPublishDoc | null | undefined,
): Date | null {
	const publishAt = readPublishAt(doc);
	if (publishAt === "") {
		return null;
	}

	const moment = new Date(publishAt);
	return Number.isNaN(moment.getTime()) ? null : moment;
}

/**
 * Which of the three states the admin shows for this review at `now`.
 *
 * `now` is a parameter so the answer is a pure function of its inputs; the
 * components pass the current clock.
 */
export function reviewPublishState(
	doc: ReviewPublishDoc | null | undefined,
	now: Date,
): ReviewPublishState {
	if (readDocumentStatus(doc) !== "published") {
		return "draft";
	}

	const moment = scheduledMoment(doc);
	if (moment !== null && moment.getTime() > now.getTime()) {
		return "scheduled";
	}

	return "live";
}

/**
 * A UTC moment an author can read back: "1 January 2030 at 00:00 UTC".
 *
 * UTC rather than the browser's zone on purpose. The field stores an instant
 * (the sidebar input shows it in local time, as Payload's date picker does),
 * and a notice that silently re-renders in whatever zone the reader happens to
 * sit in would disagree with what another author of the same review saw. The
 * zone is named in the copy so the value is never ambiguous, and the admin has
 * no dictionary to localize the surrounding words anyway.
 */
export function formatPublishMoment(moment: Date): string {
	const date = new Intl.DateTimeFormat("en-GB", {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(moment);
	const time = new Intl.DateTimeFormat("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone: "UTC",
	}).format(moment);

	return `${date} at ${time} UTC`;
}

/**
 * The sentence the edit view shows under the schedule field, or `null` when
 * there is nothing worth saying.
 *
 * A published review always gets a sentence: either when it will go live, or
 * that it already is (`FR-7`). An unscheduled draft gets none - the sidebar
 * already says it is a draft, and a notice repeating that would be noise.
 */
export function publishScheduleNotice(
	doc: ReviewPublishDoc | null | undefined,
	now: Date,
): string | null {
	const state = reviewPublishState(doc, now);

	if (state === "scheduled") {
		const moment = scheduledMoment(doc);
		if (moment === null) {
			return null;
		}
		return `Scheduled to publish on ${formatPublishMoment(moment)}.`;
	}

	if (state === "live") {
		return "Live. Readers can see this review now.";
	}

	return null;
}
