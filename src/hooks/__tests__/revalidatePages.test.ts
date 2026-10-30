import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as envModule from "../../lib/env";
import { logger } from "../../lib/logger";

const revalidatePath = mock((_path: string) => {
	throw new Error(
		'Invariant: static generation store missing in revalidatePath("/reviews")',
	);
});

mock.module("next/cache", () => ({ revalidatePath }));

/**
 * The work the hook handed to `after`, in the order it was handed over. Next
 * runs it once the response is finished; `flushDeferred` below is that moment.
 */
const deferred: Array<() => Promise<void>> = [];

const after = mock((task: () => Promise<void> | void) => {
	deferred.push(async () => {
		await task();
	});
});

mock.module("next/server", () => ({ after }));

/**
 * The slow-read threshold, overridable per test. The hook reads it at call time,
 * so mutating this object is enough to put it on either side of a real wait.
 *
 * The mock re-exports the real module: `mock.module` here replaces the module for
 * every file in the test process, and the schema is validated on its own
 * elsewhere.
 */
const slowAcquireEnv = { ...envModule.env, DB_POOL_SLOW_ACQUIRE_MS: 60_000 };

mock.module("../../lib/env", () => ({ ...envModule, env: slowAcquireEnv }));

const { revalidateReadingListPages, revalidateReviewPages } = await import(
	"../revalidatePages"
);

/** Runs everything the hook deferred, as the end of the response would. */
async function flushDeferred(): Promise<void> {
	const pending = deferred.splice(0, deferred.length);
	for (const task of pending) {
		await task();
	}
}

/** The paths `revalidatePath` was asked to drop, in call order. */
function revalidatedPaths(): string[] {
	return revalidatePath.mock.calls.map(([path]) => path as string);
}

/**
 * A `payload.find` stand-in whose two neighbour queries answer with the slugs
 * they are given, dispatching on the sort each side uses.
 */
function neighbourFinder({
	newer,
	older,
}: {
	newer?: Array<{ slug: string; title?: string }>;
	older?: Array<{ slug: string; title?: string }>;
}) {
	return mock(
		async (args: {
			sort?: string[];
			limit?: number;
		}): Promise<{
			docs: unknown[];
		}> => ({
			docs: args.sort?.[1] === "-slug" ? (newer ?? []) : (older ?? []),
		}),
	);
}

describe("revalidateReviewPages", () => {
	beforeEach(() => {
		revalidatePath.mockClear();
		after.mockClear();
		deferred.splice(0, deferred.length);
		slowAcquireEnv.DB_POOL_SLOW_ACQUIRE_MS = 60_000;
	});

	it("defers the revalidation of a review page in both locales", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});

		const doc = {
			id: 1,
			title: "Test Review",
			slug: "e2e-fixture-review",
			_status: "published",
		};

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: null as never,
			operation: "create",
			data: {} as never,
			req: { payload: { find: mock() } } as never,
			collection: {} as never,
			context: {},
		});

		// The write commits first: nothing is invalidated while the hook runs.
		expect(result).toBe(doc);
		expect(revalidatePath).not.toHaveBeenCalled();
		expect(after).toHaveBeenCalledTimes(1);

		await flushDeferred();

		// Both locales, because each public page is cached per locale: the
		// index, the review itself, the homepage and the feeds.
		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/e2e-fixture-review",
			"/id/reviews/e2e-fixture-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);

		// No request scope in a unit test, so every call takes the tolerated
		// path rather than being recorded as a revalidation.
		expect(warn).toHaveBeenCalled();
	});

	it("defers the revalidation of a reading list page in both locales", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const doc = {
			id: 2,
			title: "Test Reading List",
			slug: "e2e-fixture-reading-list",
			_status: "published",
		};

		await revalidateReadingListPages({
			doc: doc as never,
			previousDoc: null as never,
			operation: "update",
			data: {} as never,
			req: {} as never,
			collection: {} as never,
			context: {},
		});

		expect(revalidatePath).not.toHaveBeenCalled();

		await flushDeferred();

		expect(revalidatedPaths()).toEqual([
			"/en/reading-lists",
			"/id/reading-lists",
			"/en/reading-lists/e2e-fixture-reading-list",
			"/id/reading-lists/e2e-fixture-reading-list",
			"/en",
			"/id",
		]);
	});

	it("rethrows a failure that is not the out-of-scope invariant", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		const warnCallsBefore = warn.mock.calls.length;

		revalidatePath.mockImplementation(() => {
			throw new Error("Something else went wrong");
		});

		try {
			// The write is already committed by the time this runs, so the hook
			// itself still resolves; the failure belongs to the deferred work
			// and is visible there rather than swallowed.
			await revalidateReviewPages({
				doc: {
					id: 3,
					title: "Broken Revalidation",
					slug: "broken-revalidation",
					_status: "published",
				} as never,
				previousDoc: null as never,
				operation: "update",
				data: {} as never,
				req: { payload: { find: mock() } } as never,
				collection: {} as never,
				context: {},
			});

			await expect(flushDeferred()).rejects.toThrow(
				"Something else went wrong",
			);

			expect(warn.mock.calls.length).toBe(warnCallsBefore);
		} finally {
			revalidatePath.mockImplementation(() => {
				throw new Error(
					'Invariant: static generation store missing in revalidatePath("/reviews")',
				);
			});
		}
	});

	it("revalidates neighbour pages in both locales on publish", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = neighbourFinder({
			newer: [{ slug: "newer-review", title: "Newer Review" }],
			older: [{ slug: "older-review", title: "Older Review" }],
		});

		const doc = {
			id: 4,
			title: "Middle Review",
			slug: "middle-review",
			_status: "published",
			publishDate: "2026-10-20T00:00:00.000Z",
		};

		await revalidateReviewPages({
			doc: doc as never,
			previousDoc: { id: 4, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		// Neither the lookup nor the invalidation belongs to the hook body.
		expect(find).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();

		await flushDeferred();

		// Two bounded queries, one per side, so the neighbours' own prev/next
		// links stop pointing at stale content.
		expect(find.mock.calls.length).toBe(2);
		for (const [args] of find.mock.calls) {
			expect(args.limit).toBe(1);
		}

		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/middle-review",
			"/id/reviews/middle-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
			"/en/reviews/newer-review",
			"/id/reviews/newer-review",
			"/en/reviews/older-review",
			"/id/reviews/older-review",
		]);
	});

	it("revalidates neighbours on unpublish, when their links disappear", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = neighbourFinder({
			newer: [{ slug: "newer-kept", title: "Newer Kept" }],
			older: [{ slug: "older-kept", title: "Older Kept" }],
		});

		const doc = {
			id: 5,
			title: "Unpublished Review",
			slug: "unpublished-review",
			_status: "draft",
			publishDate: "2026-10-21T00:00:00.000Z",
		};

		await revalidateReviewPages({
			doc: doc as never,
			previousDoc: { id: 5, _status: "published" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/unpublished-review",
			"/id/reviews/unpublished-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
			"/en/reviews/newer-kept",
			"/id/reviews/newer-kept",
			"/en/reviews/older-kept",
			"/id/reviews/older-kept",
		]);
	});

	it("revalidates nothing extra when there are no neighbours", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = neighbourFinder({});

		await revalidateReviewPages({
			doc: {
				id: 6,
				title: "Only Review",
				slug: "only-review",
				_status: "published",
				publishDate: "2026-10-22T00:00:00.000Z",
			} as never,
			previousDoc: { id: 6, _status: "published" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(find.mock.calls.length).toBe(2);
		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/only-review",
			"/id/reviews/only-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
	});

	it("revalidates nothing extra without a slug or date and does not throw", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = mock(async () => {
			throw new Error("find must not be called without a slug and a date");
		});

		await revalidateReviewPages({
			doc: {
				id: 7,
				title: "Undated Review",
				_status: "published",
			} as never,
			previousDoc: { id: 7, _status: "published" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(find.mock.calls.length).toBe(0);
		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
	});

	it("leaves the write standing when the neighbour lookup fails", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});

		const find = mock(async () => {
			throw new Error("timeout exceeded when trying to connect");
		});

		const doc = {
			id: 8,
			title: "Starved Review",
			slug: "starved-review",
			_status: "published",
			publishDate: "2026-10-23T00:00:00.000Z",
		};

		// Publishing has already committed: a cache warm-up of two neighbouring
		// pages must not turn that into a failure.
		await expect(
			revalidateReviewPages({
				doc: doc as never,
				previousDoc: { id: 8, _status: "draft" } as never,
				operation: "update",
				data: {} as never,
				req: { payload: { find } } as never,
				collection: {} as never,
				context: {},
			}),
		).resolves.toBe(doc);

		await flushDeferred();

		// The pages that do not depend on the lookup are still revalidated.
		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/starved-review",
			"/id/reviews/starved-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);

		const failureLog = warn.mock.calls.find(([message]) =>
			message.includes("Neighbour lookup failed"),
		);

		expect(failureLog).toBeDefined();
		expect(failureLog?.[1]).toMatchObject({
			kind: "neighbour_lookup_failed",
			slug: "starved-review",
			digest: "Error: timeout exceeded when trying to connect",
		});
	});

	it("revalidates nothing on a draft save", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = mock(async () => ({ docs: [] }));

		await revalidateReviewPages({
			doc: { id: 9, title: "Draft Review", slug: "draft-review" } as never,
			previousDoc: { id: 9, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(after).not.toHaveBeenCalled();
		expect(find.mock.calls.length).toBe(0);
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	// `NFR-5`: the acquisition time the incident never reported. Payload's adapter
	// exposes its pool only after init, so the deferred read stands in for the
	// wait; past the threshold it names the milliseconds.
	it("logs a structured warning when the deferred read waits past the threshold", async () => {
		slowAcquireEnv.DB_POOL_SLOW_ACQUIRE_MS = 5;

		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		// `spyOn` returns this process's one spy on the logger, so calls recorded
		// by earlier cases are still on it.
		warn.mockClear();

		const find = mock(async () => {
			await Bun.sleep(40);
			return { docs: [] };
		});

		await revalidateReviewPages({
			doc: {
				id: 10,
				title: "Slow Review",
				slug: "slow-review",
				_status: "published",
				publishDate: "2026-10-24T00:00:00.000Z",
			} as never,
			previousDoc: { id: 10, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		const slowLog = warn.mock.calls.find(
			([, details]) =>
				(details as { kind?: string } | undefined)?.kind ===
				"db_pool_slow_acquire",
		);

		expect(slowLog).toBeDefined();

		const [message, details] = slowLog ?? [];
		expect(message).toContain("waited");
		expect(details).toMatchObject({
			kind: "db_pool_slow_acquire",
			subject: 'review "slow-review"',
			thresholdMs: 5,
		});
		expect((details as { elapsedMs: number }).elapsedMs).toBeGreaterThanOrEqual(
			5,
		);
	});

	it("stays quiet when the deferred read is quick", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		warn.mockClear();

		const find = neighbourFinder({
			newer: [{ slug: "newer-quiet", title: "Newer Quiet" }],
		});

		await revalidateReviewPages({
			doc: {
				id: 11,
				title: "Quick Review",
				slug: "quick-review",
				_status: "published",
				publishDate: "2026-10-25T00:00:00.000Z",
			} as never,
			previousDoc: { id: 11, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(find.mock.calls.length).toBe(2);
		expect(
			warn.mock.calls.some(
				([, details]) =>
					(details as { kind?: string } | undefined)?.kind ===
					"db_pool_slow_acquire",
			),
		).toBe(false);
	});
});
