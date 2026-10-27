import { describe, expect, it, mock, spyOn } from "bun:test";
import { logger } from "../../lib/logger";

/**
 * Regression test for the revalidation guard.
 *
 * `revalidatePath` only works inside a Next.js request scope. Outside one - a
 * local-API seed, for example - it throws, and an uncaught throw in an
 * `afterChange` hook rolls the write back. The guard keeps the write alive and
 * logs the failure instead.
 */
const revalidatePath = mock((_path: string) => {
	throw new Error(
		'Invariant: static generation store missing in revalidatePath("/reviews")',
	);
});

mock.module("next/cache", () => ({ revalidatePath }));

const { revalidateReadingListPages, revalidateReviewPages } = await import(
	"../revalidatePages"
);

describe("revalidatePages", () => {
	it("revalidates a review page in both locales", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const doc = {
			id: 1,
			title: "E2E Fixture Review",
			slug: "e2e-fixture-review",
			_status: "published",
		};

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: doc as never,
			operation: "create",
			data: {} as never,
			req: {} as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		// The browse page, the detail page, the homepage and the feed each exist
		// once per locale.
		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/e2e-fixture-review",
			"/id/reviews/e2e-fixture-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
		expect(warn).toHaveBeenCalled();
	});

	it("revalidates a reading list page in both locales", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const doc = {
			id: 2,
			title: "E2E Fixture Reading List",
			slug: "e2e-fixture-reading-list",
			_status: "published",
		};

		const result = await revalidateReadingListPages({
			doc: doc as never,
			previousDoc: doc as never,
			operation: "create",
			data: {} as never,
			req: {} as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
			"/en/reading-lists",
			"/id/reading-lists",
			"/en/reading-lists/e2e-fixture-reading-list",
			"/id/reading-lists/e2e-fixture-reading-list",
			"/en",
			"/id",
		]);
		expect(warn).toHaveBeenCalled();
	});

	it("rethrows a failure that is not the out-of-scope invariant", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		const warningsBefore = warn.mock.calls.length;
		revalidatePath.mockImplementation(() => {
			throw new Error("Something else went wrong");
		});

		const doc = {
			id: 3,
			title: "E2E Fixture Review",
			slug: "e2e-fixture-review",
			_status: "published",
		};

		try {
			await expect(
				revalidateReviewPages({
					doc: doc as never,
					previousDoc: doc as never,
					operation: "create",
					data: {} as never,
					req: {} as never,
					collection: {} as never,
					context: {},
				}),
			).rejects.toThrow("Something else went wrong");
			// A failure the guard does not tolerate is not downgraded to a
			// log line.
			expect(warn.mock.calls.length).toBe(warningsBefore);
		} finally {
			// The other cases rely on the original failure, so the mock goes
			// back to throwing the out-of-scope invariant.
			revalidatePath.mockImplementation(() => {
				throw new Error(
					'Invariant: static generation store missing in revalidatePath("/reviews")',
				);
			});
		}
	});

	it("revalidates neighbour pages in both locales on publish", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const find = mock((args: { sort?: string[] }) => {
			if (args.sort?.[0] === "publishDate") {
				return Promise.resolve({
					docs: [{ slug: "newer-review", title: "Newer Review" }],
				});
			}
			return Promise.resolve({
				docs: [{ slug: "older-review", title: "Older Review" }],
			});
		});
		const doc = {
			id: 4,
			title: "Middle Review",
			slug: "middle-review",
			publishDate: "2026-10-20T00:00:00.000Z",
			_status: "published",
		};
		const previousDoc = { ...doc, _status: "draft" };

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: previousDoc as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		// The neighbour lookup reuses the review ordering: two bounded
		// `limit: 1` queries, one per side.
		expect(find.mock.calls.length).toBe(2);
		for (const [args] of find.mock.calls) {
			expect((args as { limit: number }).limit).toBe(1);
		}
		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
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
		expect(warn).toHaveBeenCalled();
	});

	it("revalidates neighbours on unpublish, when their links disappear", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const find = mock((args: { sort?: string[] }) => {
			if (args.sort?.[0] === "publishDate") {
				return Promise.resolve({
					docs: [{ slug: "newer-kept", title: "Newer Kept" }],
				});
			}
			return Promise.resolve({
				docs: [{ slug: "older-kept", title: "Older Kept" }],
			});
		});
		const doc = {
			id: 5,
			title: "Unpublished Review",
			slug: "unpublished-review",
			publishDate: "2026-10-20T00:00:00.000Z",
			_status: "draft",
		};
		const previousDoc = { ...doc, _status: "published" };

		await revalidateReviewPages({
			doc: doc as never,
			previousDoc: previousDoc as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
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
		expect(warn).toHaveBeenCalled();
	});

	it("revalidates nothing extra when there are no neighbours", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const find = mock(() => Promise.resolve({ docs: [] }));
		const doc = {
			id: 6,
			title: "Only Review",
			slug: "only-review",
			publishDate: "2026-10-20T00:00:00.000Z",
			_status: "published",
		};

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: doc as never,
			operation: "create",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en/reviews/only-review",
			"/id/reviews/only-review",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
		expect(warn).toHaveBeenCalled();
	});

	it("revalidates nothing extra without a slug or date and does not throw", async () => {
		spyOn(logger, "warn").mockImplementation(() => {});
		revalidatePath.mockClear();
		const find = mock(() =>
			Promise.reject(new Error("find must not be called")),
		);
		const doc = { id: 7, title: "Undated Review", _status: "published" };

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: undefined as never,
			operation: "create",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		expect(find.mock.calls.length).toBe(0);
		expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual([
			"/en/reviews",
			"/id/reviews",
			"/en",
			"/id",
			"/en/feed.xml",
			"/id/feed.xml",
		]);
	});

	it("revalidates nothing on a draft save", async () => {
		revalidatePath.mockClear();
		const find = mock(() =>
			Promise.reject(new Error("find must not be called")),
		);
		const doc = {
			id: 8,
			title: "Draft Review",
			slug: "draft-review",
			publishDate: "2026-10-20T00:00:00.000Z",
			_status: "draft",
		};
		const previousDoc = { ...doc };

		const result = await revalidateReviewPages({
			doc: doc as never,
			previousDoc: previousDoc as never,
			operation: "update",
			data: {} as never,
			req: { payload: { find } } as never,
			collection: {} as never,
			context: {},
		});

		expect(result).toBe(doc);
		expect(find.mock.calls.length).toBe(0);
		expect(revalidatePath.mock.calls.length).toBe(0);
	});
});
