import { describe, expect, it } from "bun:test";
import type { Where } from "payload";
import {
	canAcceptPublicWrite,
	isPubliclyVisible,
	publishedAndVisibleWhere,
} from "../publish-visibility";

const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("publish-visibility", () => {
	describe("isPubliclyVisible", () => {
		it("hides a review that is not published", () => {
			expect(
				isPubliclyVisible({ _status: "draft", publishAt: null }, NOW),
			).toBe(false);
			expect(isPubliclyVisible({ _status: null }, NOW)).toBe(false);
			expect(isPubliclyVisible({}, NOW)).toBe(false);
		});

		it("shows a published review with no schedule", () => {
			// Every review written before scheduling existed has no `publishAt`,
			// and it must stay visible without a backfill.
			expect(isPubliclyVisible({ _status: "published" }, NOW)).toBe(true);
			expect(
				isPubliclyVisible({ _status: "published", publishAt: null }, NOW),
			).toBe(true);
		});

		it("shows a published review whose schedule has passed", () => {
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: "2026-05-01T00:00:00.000Z" },
					NOW,
				),
			).toBe(true);
		});

		it("hides a published review scheduled for the future", () => {
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: "2026-07-01T00:00:00.000Z" },
					NOW,
				),
			).toBe(false);
		});

		it("treats the boundary as inclusive", () => {
			// A review scheduled for exactly `now` is visible. That is what
			// makes "appears within the revalidation window" testable without
			// sleeping on a millisecond.
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: NOW.toISOString() },
					NOW,
				),
			).toBe(true);
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: "2026-06-01T12:00:00.001Z" },
					NOW,
				),
			).toBe(false);
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: "2026-06-01T11:59:59.999Z" },
					NOW,
				),
			).toBe(true);
		});

		it("treats an unparsable timestamp as unscheduled", () => {
			// Payload's `date` column cannot hold an invalid timestamp, so this
			// is a corrupt row. Showing it is the lesser failure - the review
			// is published, only its schedule is unreadable.
			expect(
				isPubliclyVisible(
					{ _status: "published", publishAt: "not-a-timestamp" },
					NOW,
				),
			).toBe(true);
			expect(
				isPubliclyVisible({ _status: "published", publishAt: "" }, NOW),
			).toBe(true);
		});
	});

	describe("canAcceptPublicWrite", () => {
		it("refuses a review scheduled for the future", () => {
			// A comment is a public write, so it answers like a public read:
			// the reader who cannot see the review cannot comment on it.
			expect(
				canAcceptPublicWrite(
					{ _status: "published", publishAt: "2026-07-01T00:00:00.000Z" },
					NOW,
				),
			).toBe(false);
		});

		it("accepts a visible review", () => {
			expect(
				canAcceptPublicWrite(
					{ _status: "published", publishAt: "2026-05-01T00:00:00.000Z" },
					NOW,
				),
			).toBe(true);
			expect(canAcceptPublicWrite({ _status: "published" }, NOW)).toBe(true);
		});

		it("refuses a review that is not published", () => {
			expect(canAcceptPublicWrite({ _status: "draft" }, NOW)).toBe(false);
		});
	});

	describe("publishedAndVisibleWhere", () => {
		it("requires the published status", () => {
			const where = publishedAndVisibleWhere(NOW) as Where & {
				and: Where[];
			};

			expect(where.and).toHaveLength(2);
			expect(where.and[0]).toEqual({
				_status: { equals: "published" },
			});
		});

		it("accepts an unscheduled review through exists: false", () => {
			// `publish_at` is NULL on every review that was never scheduled.
			// A `less_than_equal` alone compares against NULL and matches
			// nothing, so both branches are required.
			const where = publishedAndVisibleWhere(NOW) as Where & {
				and: Where[];
			};

			expect(where.and[1]).toEqual({
				or: [
					{ publishAt: { exists: false } },
					{ publishAt: { less_than_equal: NOW.toISOString() } },
				],
			});
		});

		it("binds the schedule to the instant it was built for", () => {
			const where = publishedAndVisibleWhere(
				new Date("2030-01-01T00:00:00.000Z"),
			) as Where & { and: Where[] };
			const visibleAt = where.and[1].or as Array<
				Record<string, { less_than_equal?: string }>
			>;

			expect(visibleAt[1].publishAt.less_than_equal).toBe(
				"2030-01-01T00:00:00.000Z",
			);
		});
	});
});
