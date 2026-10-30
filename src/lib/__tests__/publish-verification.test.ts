import { describe, expect, mock, test } from "bun:test";

// The verifier reports through the shared reporter, which captures to Sentry
// at the top level, so the stub is registered before the module under test is
// imported below.
const captureException = mock(
	(_error: unknown, _context?: { extra?: Record<string, unknown> }) =>
		undefined,
);

mock.module("@sentry/nextjs", () => ({ captureException }));

const { classifyPublishOutcome } = await import("../publish-verification");

/** The moment every case is judged at. */
const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("classifyPublishOutcome", () => {
	test("a published review with no schedule is visible", () => {
		expect(classifyPublishOutcome({ _status: "published" }, NOW)).toBe(
			"visible",
		);
	});

	test("a published review whose schedule has arrived is visible", () => {
		expect(
			classifyPublishOutcome(
				{ _status: "published", publishAt: "2026-10-29T00:00:00.000Z" },
				NOW,
			),
		).toBe("visible");
	});

	test("a published review scheduled for the future is scheduled", () => {
		expect(
			classifyPublishOutcome(
				{ _status: "published", publishAt: "2026-11-01T00:00:00.000Z" },
				NOW,
			),
		).toBe("scheduled");
	});

	// The visibility rule's boundary is inclusive, and the classifier must not
	// disagree with it on the exact millisecond a schedule lands.
	test("a published review scheduled for this very moment is visible", () => {
		expect(
			classifyPublishOutcome(
				{ _status: "published", publishAt: NOW.toISOString() },
				NOW,
			),
		).toBe("visible");
	});

	test("a draft is not published whatever its schedule says", () => {
		expect(
			classifyPublishOutcome(
				{ _status: "draft", publishAt: "2026-10-01T00:00:00.000Z" },
				NOW,
			),
		).toBe("not-published");
	});

	// `isPubliclyVisible` treats an unreadable schedule as unset, so the
	// classifier reports what a reader would see rather than inventing a
	// fourth answer for a corrupt row.
	test("an unparsable publishAt leaves a published review visible", () => {
		expect(
			classifyPublishOutcome(
				{ _status: "published", publishAt: "not a date" },
				NOW,
			),
		).toBe("visible");
	});

	test("a review with no status at all is not published", () => {
		expect(classifyPublishOutcome({}, NOW)).toBe("not-published");
	});
});
