import { describe, expect, it } from "bun:test";
import {
	formatPublishMoment,
	publishScheduleNotice,
	REVIEW_PUBLISH_STATE_LABELS,
	type ReviewPublishDoc,
	reviewPublishState,
} from "../Reviews/admin/publish-state";

/**
 * How the admin names a review's publish state (`FR-7`, `AC-7`).
 *
 * The derivation is pure, so the list cell and the edit-view notice are proved
 * here, without a browser and without a database. The components are thin
 * wrappers over these functions.
 */

const NOW = new Date("2026-06-01T12:00:00.000Z");
const FUTURE = "2030-01-01T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";

/** A published review with the given schedule. */
function published(publishAt?: unknown): ReviewPublishDoc {
	return { _status: "published", publishAt };
}

describe("the admin publish state", () => {
	it("calls a published review with a future schedule scheduled", () => {
		expect(reviewPublishState(published(FUTURE), NOW)).toBe("scheduled");
	});

	it("calls a published review live when the moment has arrived", () => {
		// The gate is inclusive, so at the exact moment the review is already
		// public - and the admin must not claim otherwise.
		expect(reviewPublishState(published(NOW.toISOString()), NOW)).toBe("live");
	});

	it("calls a published review with a past schedule live", () => {
		expect(reviewPublishState(published(PAST), NOW)).toBe("live");
	});

	it("calls a published review with no schedule live", () => {
		expect(reviewPublishState(published(undefined), NOW)).toBe("live");
		expect(reviewPublishState(published(null), NOW)).toBe("live");
		expect(reviewPublishState(published(""), NOW)).toBe("live");
	});

	it("calls a document that was never published a draft", () => {
		expect(reviewPublishState({ _status: "draft" }, NOW)).toBe("draft");
		expect(reviewPublishState({}, NOW)).toBe("draft");
	});

	it("still calls a draft with a future schedule a draft", () => {
		// Readers cannot see it and the schedule does not change that, which is
		// the spec's own edge case: a scheduled draft is a draft.
		expect(
			reviewPublishState({ _status: "draft", publishAt: FUTURE }, NOW),
		).toBe("draft");
	});

	it("treats an unreadable schedule as no schedule", () => {
		// The visibility rule does the same, so the two cannot disagree.
		expect(reviewPublishState(published("not a date"), NOW)).toBe("live");
	});

	it("has one word per state", () => {
		expect(REVIEW_PUBLISH_STATE_LABELS).toEqual({
			scheduled: "Scheduled",
			live: "Live",
			draft: "Draft",
		});
	});
});

describe("the publish moment", () => {
	it("names the date, the time and the zone", () => {
		expect(formatPublishMoment(new Date(FUTURE))).toBe(
			"1 January 2030 at 00:00 UTC",
		);
	});
});

describe("the edit-view notice", () => {
	it("says when a scheduled review will publish", () => {
		expect(publishScheduleNotice(published(FUTURE), NOW)).toBe(
			"Scheduled to publish on 1 January 2030 at 00:00 UTC.",
		);
	});

	it("says a review is already live", () => {
		expect(publishScheduleNotice(published(PAST), NOW)).toBe(
			"Live. Readers can see this review now.",
		);
		expect(publishScheduleNotice(published(undefined), NOW)).toBe(
			"Live. Readers can see this review now.",
		);
	});

	it("says nothing about a draft", () => {
		expect(publishScheduleNotice({ _status: "draft" }, NOW)).toBeNull();
		expect(
			publishScheduleNotice({ _status: "draft", publishAt: FUTURE }, NOW),
		).toBeNull();
	});
});
