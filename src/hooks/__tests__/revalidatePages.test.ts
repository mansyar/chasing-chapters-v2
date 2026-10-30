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

/**
 * The reporter the deferred verification reaches for, stubbed before the hook
 * is imported. `error-locale` calls `Sentry.captureException`, so replacing the
 * module is what makes "reported exactly once" observable from here rather than
 * only from the module that raises it.
 */
const captureException = mock(
	(_error: unknown, _options?: unknown) => undefined,
);

mock.module("@sentry/nextjs", () => ({ captureException }));

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
 * A `payload.find` stand-in for the two kinds of read the hook makes: the
 * neighbour lookups, which sort, and the post-response public-gate read, which
 * does not. The gate read answers with `verified` - the slug a public reader
 * would find - or with nothing, as a review that never became visible would.
 */
function reviewFinder({
	newer,
	older,
	verified = "verified-review",
}: {
	newer?: Array<{ slug: string; title?: string }>;
	older?: Array<{ slug: string; title?: string }>;
	verified?: string | null;
}) {
	return mock(
		async (args: {
			sort?: string[];
			limit?: number;
		}): Promise<{
			docs: unknown[];
		}> => {
			if (args.sort === undefined) {
				return { docs: verified ? [{ slug: verified }] : [] };
			}

			return {
				docs: args.sort[1] === "-slug" ? (newer ?? []) : (older ?? []),
			};
		},
	);
}

/** The neighbour lookups only: the public-gate read is the one without a sort. */
function neighbourLookups(find: ReturnType<typeof reviewFinder>): number {
	return find.mock.calls.filter(([args]) => args.sort !== undefined).length;
}

describe("revalidateReviewPages", () => {
	beforeEach(() => {
		revalidatePath.mockClear();
		after.mockClear();
		captureException.mockClear();
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
			req: { payload: { find: reviewFinder({}) } } as never,
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

	it("logs a revalidation failure instead of losing the verification", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		const find = reviewFinder({});

		revalidatePath.mockImplementation(() => {
			throw new Error("Something else went wrong");
		});

		try {
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
				req: { payload: { find } } as never,
				collection: {} as never,
				context: {},
			});

			// The write is committed and the two deferred jobs are independent:
			// a revalidation failure is recorded, and it does not take the
			// visibility check down with it.
			await expect(flushDeferred()).resolves.toBeUndefined();

			expect(
				warn.mock.calls.some(
					([, details]) =>
						(details as { kind?: string } | undefined)?.kind ===
						"revalidation_deferred_failed",
				),
			).toBe(true);

			expect(
				find.mock.calls.filter(([args]) => args.sort === undefined),
			).toHaveLength(1);
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

		const find = reviewFinder({
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
		expect(neighbourLookups(find)).toBe(2);
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

		const find = reviewFinder({
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

		const find = reviewFinder({});

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

		expect(neighbourLookups(find)).toBe(2);
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

	// `FR-5`: the publish response has been sent by the time this read runs, and
	// it goes through the same gate an anonymous reader's request goes through.
	it("verifies a published review through the public gate after the response", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = reviewFinder({});

		await revalidateReviewPages({
			doc: {
				id: 12,
				title: "Verified Review",
				slug: "verified-review",
				_status: "published",
			} as never,
			previousDoc: { id: 12, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		// Nothing is read while the write's transaction is still open.
		expect(find).not.toHaveBeenCalled();

		await flushDeferred();

		const gateRead = find.mock.calls.find(([args]) => args.sort === undefined);
		expect(gateRead).toBeDefined();

		const [query] = gateRead ?? [];
		expect(query).toMatchObject({
			collection: "reviews",
			overrideAccess: false,
			limit: 1,
			depth: 0,
			pagination: false,
		});
		// No user, so the collection's public read access is the gate.
		expect(query).not.toHaveProperty("user");
	});

	// `AC-5`: the report has to come out of the deferred wiring, not only out of
	// the module that raises it - a regression that keeps the read and drops the
	// report would otherwise pass every test.
	it("reports a publish the public gate cannot see, once, with the slug", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const find = reviewFinder({ verified: null });

		await revalidateReviewPages({
			doc: {
				id: 13,
				title: "Invisible Review",
				slug: "invisible-review",
				_status: "published",
			} as never,
			previousDoc: { id: 13, _status: "draft" } as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		await flushDeferred();

		expect(captureException).toHaveBeenCalledTimes(1);

		const [reported, options] = captureException.mock.calls[0] ?? [];
		expect(String(reported)).toContain("invisible-review");
		expect(String(reported)).toContain("13");
		expect(options).toMatchObject({
			extra: { route: "/en/reviews/invisible-review", locale: "en" },
		});
	});

	// The translation pipeline writes again after the response, which re-enters
	// this hook. That is intended: the same pages are invalidated once per write,
	// not twice for one write, and nothing here throws.
	it("defers once per write when a post-response write re-enters the hook", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		const doc = {
			id: 14,
			title: "Translated Review",
			slug: "translated-review",
			_status: "published",
		};

		// The pipeline's own update: published to published, translation skipped.
		await revalidateReviewPages({
			doc: doc as never,
			previousDoc: doc as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find: reviewFinder({}) } } as never,
			collection: {} as never,
			context: { skipTranslation: true },
		});

		expect(after).toHaveBeenCalledTimes(1);

		await flushDeferred();

		// One invalidation per path for that write, not a second pass.
		expect(revalidatedPaths()).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/translated-review",
			"/id/reviews/translated-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
	});

	// `AC-4`: a scheduled publish is intentionally invisible, so it is recorded
	// as information and the gate is never read for it.
	it("records a scheduled publish as information instead of reading the gate", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});

		// `spyOn` hands back this process's one spy on the method, so a spy left
		// installed would keep recording every later file's info lines. This one
		// is restored before the case ends.
		const info = spyOn(logger, "info").mockImplementation(() => {});
		info.mockClear();

		try {
			const find = reviewFinder({});

			await revalidateReviewPages({
				doc: {
					id: 13,
					title: "Scheduled Review",
					slug: "scheduled-review",
					_status: "published",
					publishAt: "2999-01-01T00:00:00.000Z",
				} as never,
				previousDoc: { id: 13, _status: "draft" } as never,
				operation: "update",
				data: {} as never,
				req: { payload: { find } } as never,
				collection: {} as never,
				context: {},
			});

			await flushDeferred();

			const scheduledLog = info.mock.calls.find(
				([, details]) =>
					(details as { kind?: string } | undefined)?.kind ===
					"review_publish_scheduled",
			);

			expect(scheduledLog).toBeDefined();
			expect(scheduledLog?.[1]).toMatchObject({
				kind: "review_publish_scheduled",
				slug: "scheduled-review",
				publishAt: "2999-01-01T00:00:00.000Z",
			});
			expect(find.mock.calls.some(([args]) => args.sort === undefined)).toBe(
				false,
			);
		} finally {
			info.mockRestore();
		}
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

		const find = mock(async (args: { sort?: string[] }) => {
			await Bun.sleep(40);
			return { docs: args.sort ? [] : [{ slug: "slow-review" }] };
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

		const find = reviewFinder({
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

		expect(neighbourLookups(find)).toBe(2);
		expect(
			warn.mock.calls.some(
				([, details]) =>
					(details as { kind?: string } | undefined)?.kind ===
					"db_pool_slow_acquire",
			),
		).toBe(false);
	});
});
