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
const revalidatePath = mock(() => {
	throw new Error(
		'Invariant: static generation store missing in revalidatePath("/reviews")',
	);
});

mock.module("next/cache", () => ({ revalidatePath }));

const { revalidateReadingListPages, revalidateReviewPages } = await import(
	"../revalidatePages"
);

describe("revalidatePages", () => {
	it("keeps a review write alive when the page cache cannot be revalidated", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
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
		expect(revalidatePath).toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
	});

	it("keeps a reading list write alive when the page cache cannot be revalidated", async () => {
		const warn = spyOn(logger, "warn").mockImplementation(() => {});
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
		expect(revalidatePath).toHaveBeenCalled();
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
});
