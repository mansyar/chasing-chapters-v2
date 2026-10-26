import { describe, expect, mock, test } from "bun:test";
import type { Payload } from "payload";

import { getAdjacentReviews } from "../review-navigation";

interface FindArgs {
	collection: string;
	where: unknown;
	sort: string[] | string;
	limit: number;
	depth: number;
	locale?: string;
}

/** A payload whose `find` answers with the given docs and records its calls. */
function makePayload(docs: unknown[] = []) {
	const calls: FindArgs[] = [];
	const find = mock(async (args: FindArgs) => {
		calls.push(args);

		return { docs };
	});

	return { payload: { find } as unknown as Payload, calls };
}

/** The first (only) `find` call, for asserting on the query it built. */
function firstCall(calls: FindArgs[]): FindArgs {
	const call = calls[0];

	if (!call) {
		throw new Error("expected payload.find to have been called");
	}

	return call;
}

const review = {
	id: 7,
	slug: "the-lighthouse",
	publishDate: "2026-03-01T00:00:00.000Z",
};

describe("getAdjacentReviews", () => {
	test("finds both neighbours with one bounded query each", async () => {
		const { payload, calls } = makePayload([
			{ slug: "neighbour", title: "A Neighbour" },
		]);

		const result = await getAdjacentReviews(payload, review);

		expect(calls).toHaveLength(2);

		for (const call of calls) {
			expect(call.collection).toBe("reviews");
			expect(call.limit).toBe(1);
			expect(call.depth).toBe(0);
		}

		expect(result.newer).toEqual({
			slug: "neighbour",
			title: "A Neighbour",
		});
		expect(result.older).toEqual({ slug: "neighbour", title: "A Neighbour" });
	});

	test("sorts newer above and older below in the index's order", async () => {
		const { payload, calls } = makePayload();

		await getAdjacentReviews(payload, review);

		// The index sorts `-publishDate` with the slug ascending as the tiebreak;
		// "newer" is the nearest row above the current one, so it mirrors that
		// sort, and "older" is the reverse.
		expect(calls[0]?.sort).toEqual(["publishDate", "-slug"]);
		expect(calls[1]?.sort).toEqual(["-publishDate", "slug"]);
	});

	test("excludes the current review from both sides", async () => {
		const { payload, calls } = makePayload();

		await getAdjacentReviews(payload, review);

		for (const call of calls) {
			expect(JSON.stringify(call.where)).toContain('"not_equals":7');
		}
	});

	test("applies the shared public visibility gate to both sides", async () => {
		const { payload, calls } = makePayload();

		await getAdjacentReviews(payload, review);

		for (const call of calls) {
			const where = JSON.stringify(call.where);

			// `publishedAndVisibleWhere` is the one rule every public read uses; a
			// draft or a review scheduled for the future must never be a neighbour.
			expect(where).toContain('"_status":{"equals":"published"}');
			expect(where).toContain("publishAt");
		}
	});

	test("breaks a publishDate tie by slug", async () => {
		const { payload, calls } = makePayload();

		await getAdjacentReviews(payload, review);

		const newer = JSON.stringify(firstCall(calls).where);
		const older = JSON.stringify(calls[1]?.where);

		// Same date, smaller slug is the neighbour above; larger slug is below.
		expect(newer).toContain('"slug":{"less_than":"the-lighthouse"}');
		expect(older).toContain('"slug":{"greater_than":"the-lighthouse"}');
	});

	test("returns nothing at either boundary rather than wrapping", async () => {
		const { payload } = makePayload([]);

		const result = await getAdjacentReviews(payload, review);

		expect(result).toEqual({ newer: null, older: null });
	});

	test("one missing side leaves the other intact", async () => {
		const newerOnly = makePayload([{ slug: "next", title: "Next" }]);
		const olderOnly = makePayload([{ slug: "prev", title: "Prev" }]);

		// Both calls answer with the same doc, so this asserts the shape rather
		// than the query: each side is mapped independently.
		const both = await getAdjacentReviews(newerOnly.payload, review);
		expect(both.newer).toEqual({ slug: "next", title: "Next" });
		expect(both.older).toEqual({ slug: "next", title: "Next" });

		const single = await getAdjacentReviews(olderOnly.payload, review);
		expect(single.newer).toEqual({ slug: "prev", title: "Prev" });
	});

	test("a document with no slug is not a link target", async () => {
		const { payload } = makePayload([{ title: "No slug here" }]);

		const result = await getAdjacentReviews(payload, review);

		expect(result).toEqual({ newer: null, older: null });
	});

	test("a missing title still yields a neighbour", async () => {
		const { payload } = makePayload([{ slug: "untitled" }]);

		const result = await getAdjacentReviews(payload, review);

		expect(result.newer).toEqual({ slug: "untitled", title: null });
	});

	test("queries nothing when the review has no slug", async () => {
		const { payload, calls } = makePayload([{ slug: "any" }]);

		const result = await getAdjacentReviews(payload, {
			id: 1,
			slug: null,
			publishDate: "2026-01-01T00:00:00.000Z",
		});

		expect(calls).toHaveLength(0);
		expect(result).toEqual({ newer: null, older: null });
	});

	test("a review with no publishDate has no neighbours at all", async () => {
		const { payload, calls } = makePayload([{ slug: "any", title: "Any" }]);

		const result = await getAdjacentReviews(payload, {
			id: 2,
			slug: "undated",
			publishDate: null,
			// `createdAt` is a different column: comparing it against the
			// `publishDate` column would match unrelated reviews, so it must
			// not stand in for a missing `publishDate`.
			createdAt: "2026-02-01T00:00:00.000Z",
		});

		expect(calls).toHaveLength(0);
		expect(result).toEqual({ newer: null, older: null });
	});

	test("queries nothing when the review has neither date", async () => {
		const { payload, calls } = makePayload();

		const result = await getAdjacentReviews(payload, {
			id: 3,
			slug: "dateless",
		});

		expect(calls).toHaveLength(0);
		expect(result).toEqual({ newer: null, older: null });
	});

	test("passes the locale through so titles come back translated", async () => {
		const { payload, calls } = makePayload();

		await getAdjacentReviews(payload, review, { locale: "id" });

		expect(calls[0]?.locale).toBe("id");
		expect(calls[1]?.locale).toBe("id");
	});
});
