import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import type { Payload } from "payload";

/**
 * `FR-3`: a single-document slug lookup must not also count the collection.
 *
 * Payload's `find` runs `select count(*)` for the pagination total unless it is
 * told not to, and that second query is the one that timed out on the public
 * review page during the incident.
 *
 * The option is asserted at the call site rather than by importing the pages:
 * both `page.tsx` and the preview route import `next/headers`, and Bun's module
 * registry is process-wide, so whichever file in the run imports that module
 * first binds it for every other file — a page import here would fail or pass
 * depending on file order. The OG image has no such import, so its lookup is
 * also exercised for real below, which is what keeps the source scan honest.
 */

const PAGE_SOURCE = readFileSync(
	new URL("../page.tsx", import.meta.url),
	"utf8",
);

const OG_SOURCE = readFileSync(
	new URL("../opengraph-image.tsx", import.meta.url),
	"utf8",
);

/**
 * Every `payload.find({ ... })` options object in `source`, in file order,
 * sliced by brace depth so the assertions see exactly the call's own options.
 */
function findCallBlocks(source: string): string[] {
	const marker = "payload.find({";
	const blocks: string[] = [];
	let index = source.indexOf(marker);

	while (index !== -1) {
		const start = index + marker.length - 1;
		let depth = 0;

		for (let cursor = start; cursor < source.length; cursor++) {
			const character = source[cursor];

			if (character === "{") {
				depth++;
			} else if (character === "}") {
				depth--;

				if (depth === 0) {
					blocks.push(source.slice(start, cursor + 1));
					break;
				}
			}
		}

		index = source.indexOf(marker, index + marker.length);
	}

	return blocks;
}

const REVIEW = {
	id: 1,
	slug: "e2e-fixture-review",
	title: "A Review",
	bookAuthor: "An Author",
	rating: 4,
};

/** The arguments each `payload.find` call received, oldest first. */
const findCalls: Array<Record<string, unknown>> = [];

const mockPayload = {
	find: mock(async (args: Record<string, unknown>) => {
		findCalls.push(args);

		return { docs: [REVIEW] };
	}),
} as unknown as Payload;

mock.module("@payload-config", () => ({ default: {} }));
mock.module("payload", () => ({ getPayload: mock(async () => mockPayload) }));
mock.module("next/og", () => ({
	ImageResponse: class {
		constructor(
			readonly element: unknown,
			readonly size: unknown,
		) {}
	},
}));

// Import AFTER mock.module so the module binds to the mocked client.
const { default: ReviewOgImage } = await import("../opengraph-image");

describe("single-document review lookups", () => {
	it("asks the public review page lookup not to count", () => {
		// Preview branch, public branch, then the `generateStaticParams` list.
		const [preview, publicLookup, staticParams] = findCallBlocks(PAGE_SOURCE);

		expect(preview).toContain("draft: true");
		expect(preview).toContain("pagination: false");

		// The visibility gate is untouched: still slug AND published-and-visible.
		expect(publicLookup).toContain("publishedAndVisibleWhere");
		expect(publicLookup).toContain("pagination: false");

		// A list query legitimately needs its total, so it keeps counting.
		expect(staticParams).toContain("limit: 50");
		expect(staticParams).not.toContain("pagination: false");
	});

	it("asks the OG image lookup not to count", () => {
		const [ogLookup] = findCallBlocks(OG_SOURCE);

		expect(ogLookup).toContain("pagination: false");
	});

	it("passes pagination: false to the OG image lookup at runtime", async () => {
		findCalls.length = 0;

		await ReviewOgImage({
			params: Promise.resolve({ locale: "en", slug: REVIEW.slug }),
		});

		expect(findCalls.length).toBe(1);
		expect(findCalls[0]).toMatchObject({
			collection: "reviews",
			limit: 1,
			depth: 0,
			pagination: false,
		});
	});
});
