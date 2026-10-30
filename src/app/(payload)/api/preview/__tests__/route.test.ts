import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * `FR-3`: the draft-preview entry point looks one review up by slug on the same
 * pool it is about to redirect a writer to, so it must not also count the
 * collection.
 *
 * The assertion is on the call site rather than on a live call because the route
 * imports `next/headers`, and Bun's module registry is process-wide: whichever
 * file in the run imports that module first binds it for everyone, so importing
 * the route here would pass or fail on file order alone.
 */

const ROUTE_SOURCE = readFileSync(
	new URL("../route.ts", import.meta.url),
	"utf8",
);

/** The options object of the file's one `payload.find({ ... })`, brace-matched. */
function findCallBlock(source: string): string {
	const marker = "payload.find({";
	const start = source.indexOf(marker) + marker.length - 1;
	let depth = 0;

	for (let cursor = start; cursor < source.length; cursor++) {
		const character = source[cursor];

		if (character === "{") {
			depth++;
		} else if (character === "}") {
			depth--;

			if (depth === 0) {
				return source.slice(start, cursor + 1);
			}
		}
	}

	throw new Error("The preview route has no payload.find call to check");
}

describe("GET /api/preview lookup", () => {
	it("looks the review up without counting", () => {
		const block = findCallBlock(ROUTE_SOURCE);

		expect(block).toContain('collection: "reviews"');
		expect(block).toContain("limit: 1");
		expect(block).toContain("draft: true");
		expect(block).toContain("pagination: false");
	});
});
