import { describe, expect, it } from "bun:test";
import type {
	CollectionBeforeChangeHook,
	CollectionConfig,
	Field,
} from "payload";
import { isPubliclyVisible } from "../../lib/publish-visibility";
import { Reviews } from "../Reviews";

/**
 * The schedule field and the `publishDate` fill (`FR-6`, `FR-8`, `AC-6`,
 * `AC-8`).
 *
 * The tests reach into the collection the way Payload does: the field as the
 * config declares it, and the `beforeChange` hook called with the data a save
 * would hand it. Nothing here needs a database.
 */

/** The top-level field a collection stores under `name`. */
function field(config: CollectionConfig, name: string): Field {
	const found = config.fields.find(
		(candidate) => "name" in candidate && candidate.name === name,
	);

	if (!found) {
		throw new Error(`${config.slug} has no ${name} field`);
	}

	return found;
}

/** Runs the collection's `publishDate` hook over some incoming data. */
function runBeforeChange(
	data: Record<string, unknown>,
	operation: "create" | "update" = "create",
): Record<string, unknown> {
	const hook = Reviews.hooks?.beforeChange?.[0] as CollectionBeforeChangeHook;

	return hook({
		data,
		operation,
	} as unknown as Parameters<CollectionBeforeChangeHook>[0]);
}

const SCHEDULE = "2030-01-01T00:00:00.000Z";
const AUTHOR_DATE = "2026-05-05T00:00:00.000Z";

describe("reviews publish schedule", () => {
	describe("the publishAt field", () => {
		it("is an optional date in the sidebar with no default", () => {
			const publishAt = field(Reviews, "publishAt") as {
				type?: string;
				required?: boolean;
				defaultValue?: unknown;
				admin?: { position?: string; description?: string };
			};

			expect(publishAt.type).toBe("date");
			expect(publishAt.required).toBeFalsy();
			expect(publishAt.defaultValue).toBeUndefined();
			expect(publishAt.admin?.position).toBe("sidebar");
		});

		it("states the exact rule the gate enforces", () => {
			const publishAt = field(Reviews, "publishAt") as {
				admin?: { description?: string };
			};

			expect(publishAt.admin?.description).toBe(
				"Hides the review from every public page until this moment. Leave empty to publish immediately.",
			);
		});

		it("is not a second publishDate", () => {
			// `publishDate` is display metadata the page prints; the schedule is
			// a gate. They must stay separate fields.
			expect(field(Reviews, "publishDate")).not.toBe(
				field(Reviews, "publishAt"),
			);
		});
	});

	describe("filling publishDate from the schedule", () => {
		it("fills an empty publishDate with the schedule", () => {
			const data = runBeforeChange({
				_status: "published",
				publishAt: SCHEDULE,
				publishDate: null,
			});

			expect(data.publishDate).toBe(SCHEDULE);
		});

		it("fills it on a draft too, where the published fallback does not run", () => {
			const data = runBeforeChange({
				_status: "draft",
				publishAt: SCHEDULE,
			});

			expect(data.publishDate).toBe(SCHEDULE);
		});

		it("never overwrites the author's value", () => {
			const data = runBeforeChange({
				_status: "published",
				publishAt: SCHEDULE,
				publishDate: AUTHOR_DATE,
			});

			expect(data.publishDate).toBe(AUTHOR_DATE);
		});

		it("leaves the date alone when the schedule is cleared", () => {
			const data = runBeforeChange({
				_status: "published",
				publishAt: null,
				publishDate: AUTHOR_DATE,
			});

			expect(data.publishDate).toBe(AUTHOR_DATE);
		});

		it("keeps the created date for a published review with no dates", () => {
			// The behaviour that existed before the schedule: a review going
			// live without a date gets the moment it went live.
			const before = Date.now();
			const data = runBeforeChange({
				_status: "published",
			});
			const after = Date.now();

			expect(data.publishDate).toBeInstanceOf(Date);
			const filledAt = (data.publishDate as Date).getTime();
			expect(filledAt).toBeGreaterThanOrEqual(before);
			expect(filledAt).toBeLessThanOrEqual(after);
		});

		it("leaves an undated draft undated", () => {
			const data = runBeforeChange({
				_status: "draft",
			});

			expect(data.publishDate).toBeUndefined();
		});
	});

	describe("the admin surfaces that name the state", () => {
		it("lists the schedule as a default column", () => {
			expect(Reviews.admin?.defaultColumns).toContain("publishAt");
		});

		it("renders the list cell from the collection config", () => {
			const publishAt = field(Reviews, "publishAt") as {
				admin?: { components?: { Cell?: unknown } };
			};

			expect(publishAt.admin?.components?.Cell).toBe(
				"/collections/Reviews/admin/PublishStateCell#PublishStateCell",
			);
		});

		it("puts the notice in the sidebar, directly after the schedule field", () => {
			const names = Reviews.fields.map((candidate) =>
				"name" in candidate ? candidate.name : undefined,
			);
			const scheduleIndex = names.indexOf("publishAt");
			const noticeIndex = names.indexOf("publishScheduleNotice");
			const notice = field(Reviews, "publishScheduleNotice") as {
				type?: string;
				admin?: {
					position?: string;
					components?: { Field?: unknown };
				};
			};

			expect(noticeIndex).toBe(scheduleIndex + 1);
			expect(notice.type).toBe("ui");
			expect(notice.admin?.position).toBe("sidebar");
			expect(notice.admin?.components?.Field).toBe(
				"/collections/Reviews/admin/PublishScheduleNotice#PublishScheduleNotice",
			);
		});
	});

	describe("a translation that never succeeds", () => {
		// `AC-9`: the schedule is a gate of its own. A review whose Indonesian
		// translation failed, or is still missing, goes public at its moment
		// anyway - the pipeline is not part of the gate, so it cannot delay it.
		const failed = {
			_status: "published",
			publishAt: SCHEDULE,
			translationStatus: "failed",
		};

		it("stays hidden until the moment", () => {
			const before = new Date(Date.parse(SCHEDULE) - 1000);

			expect(isPubliclyVisible(failed, before)).toBeFalse();
		});

		it("becomes visible at the moment with the translation still failed", () => {
			expect(isPubliclyVisible(failed, new Date(SCHEDULE))).toBeTrue();
			expect(
				isPubliclyVisible(failed, new Date(Date.parse(SCHEDULE) + 1000)),
			).toBeTrue();
		});
	});
});
