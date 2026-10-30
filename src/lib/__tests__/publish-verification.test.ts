import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { logger } from "../logger";
import type { PublicGateRead } from "../publish-verification";
import { publishedAndVisibleWhere } from "../publish-visibility";

// The verifier reports through the shared reporter, which captures to Sentry
// at the top level, so the stub is registered before the module under test is
// imported below.
const captureException = mock(
	(_error: unknown, _context?: { extra?: Record<string, unknown> }) =>
		undefined,
);

mock.module("@sentry/nextjs", () => ({ captureException }));

const { classifyPublishOutcome, verifyPublicVisibility } = await import(
	"../publish-verification"
);

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

/** A published review as the hook hands it over. */
const PUBLISHED = {
	id: 42,
	slug: "how-to-own-the-room",
	_status: "published",
};

/** A reader that answers with the documents the public gate would return. */
function readerThatFinds(docs: Array<{ slug: string }>) {
	return mock(async (_query: PublicGateRead) => ({ docs }));
}

describe("verifyPublicVisibility", () => {
	beforeEach(() => {
		captureException.mockClear();
	});

	test("reads the review once through the public gate and stays silent when it comes back", async () => {
		const read = readerThatFinds([{ slug: PUBLISHED.slug }]);

		await expect(
			verifyPublicVisibility({ doc: PUBLISHED, now: NOW, read }),
		).resolves.toBe("visible");

		expect(read).toHaveBeenCalledTimes(1);
		const [query] = read.mock.calls[0] ?? [];
		expect(query).toMatchObject({
			collection: "reviews",
			limit: 1,
			depth: 0,
			overrideAccess: false,
			pagination: false,
		});
		// No user means the collection's public read access applies, which is
		// the gate every anonymous reader goes through.
		expect(query).not.toHaveProperty("user");
		expect(query?.where).toEqual({
			and: [
				{ slug: { equals: PUBLISHED.slug } },
				publishedAndVisibleWhere(NOW),
			],
		});
		expect(captureException).not.toHaveBeenCalled();
	});

	test("reports exactly once, with the slug, locale and id, when the gate returns nothing", async () => {
		const read = readerThatFinds([]);

		await expect(
			verifyPublicVisibility({ doc: PUBLISHED, now: NOW, read }),
		).resolves.toBe("missing");

		expect(read).toHaveBeenCalledTimes(1);
		expect(captureException).toHaveBeenCalledTimes(1);

		const [error, context] = captureException.mock.calls[0] ?? [];
		expect((error as Error).message).toContain(PUBLISHED.slug);
		expect((error as Error).message).toContain(String(PUBLISHED.id));
		expect(context?.extra).toMatchObject({
			route: `/en/reviews/${PUBLISHED.slug}`,
			locale: "en",
		});
	});

	test("reads nothing for a draft", async () => {
		const read = readerThatFinds([]);

		await expect(
			verifyPublicVisibility({
				doc: { ...PUBLISHED, _status: "draft" },
				now: NOW,
				read,
			}),
		).resolves.toBe("skipped");

		expect(read).not.toHaveBeenCalled();
		expect(captureException).not.toHaveBeenCalled();
	});

	// A scheduled publish is intentionally invisible: it is a signal, not a
	// failure, and a report here would be noise on every scheduled save.
	test("reads nothing for a scheduled publish", async () => {
		const read = readerThatFinds([]);

		await expect(
			verifyPublicVisibility({
				doc: { ...PUBLISHED, publishAt: "2026-11-01T00:00:00.000Z" },
				now: NOW,
				read,
			}),
		).resolves.toBe("skipped");

		expect(read).not.toHaveBeenCalled();
		expect(captureException).not.toHaveBeenCalled();
	});

	test("reads nothing for a review with no slug", async () => {
		const read = readerThatFinds([]);

		await expect(
			verifyPublicVisibility({
				doc: { id: 7, _status: "published" },
				now: NOW,
				read,
			}),
		).resolves.toBe("skipped");

		expect(read).not.toHaveBeenCalled();
		expect(captureException).not.toHaveBeenCalled();
	});

	// A read that fails is not evidence that the review is invisible, so it is
	// logged rather than reported; the write is already committed either way.
	test("logs a failed read instead of reporting the review missing", async () => {
		// Bun's module registry is process-wide, so an unrestored spy here would
		// silence `logger.warn` for every file that runs afterwards.
		const warn = spyOn(logger, "warn").mockImplementation(() => {});

		try {
			const read = mock(async (_query: PublicGateRead) => {
				throw new Error("timeout exceeded when trying to connect");
			});

			await expect(
				verifyPublicVisibility({ doc: PUBLISHED, now: NOW, read }),
			).resolves.toBe("unreadable");

			expect(captureException).not.toHaveBeenCalled();
			expect(
				warn.mock.calls.some(
					([, details]) =>
						(details as { kind?: string } | undefined)?.kind ===
						"publish_verification_failed",
				),
			).toBe(true);
		} finally {
			warn.mockRestore();
		}
	});
});
