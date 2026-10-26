import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	applyCommentsResult,
	type CommentSummary,
	type CommentsFetchState,
	INITIAL_COMMENTS_STATE,
	selectCommentsRender,
} from "../comment-fetch-state";

const COMPONENT_PATH = join(
	process.cwd(),
	"src/components/comments/CommentSection.tsx",
);

/**
 * The component's source with its formatting collapsed to single spaces, so a
 * guard can be matched without depending on how the file happens to be wrapped.
 */
function collapsedComponentSource(): string {
	return readFileSync(COMPONENT_PATH, "utf8").replace(/\s+/g, " ");
}

/**
 * The branch that guards `marker` in the component's source.
 *
 * A branch is written as `{condition && ( ...element... )}`, so the guard is
 * the text between the `{` that opens it and the element. The nearest `{` is
 * not always the right one - an element's own prop braces sit closer - so the
 * search walks outwards until it finds a `{` whose branch names a render
 * mode.
 */
function guardBefore(source: string, marker: string): string {
	const markerIndex = source.indexOf(marker);
	const before = source.slice(0, markerIndex);
	let cursor = before.lastIndexOf("{");

	while (cursor !== -1) {
		const segment = before.slice(cursor + 1);
		if (segment.includes("renderMode ===")) {
			return segment;
		}
		cursor = before.lastIndexOf("{", cursor - 1);
	}

	return "";
}

const aComment: CommentSummary = {
	id: 11,
	authorName: "Jane Reader",
	content: "Loved it",
	createdAt: "2026-10-20T00:00:00.000Z",
};

const loaded: CommentsFetchState = {
	comments: [aComment],
	isLoading: false,
	hasError: false,
};

describe("applyCommentsResult", () => {
	it("starts in a loading state with no error", () => {
		expect(INITIAL_COMMENTS_STATE).toEqual({
			comments: [],
			isLoading: true,
			hasError: false,
		});
	});

	it("reports a rejected fetch as an error, not as an empty list", () => {
		// The finding: a 429 left `isLoading` false with an empty list, so the
		// reader was shown "no comments yet" for a review that has comments.
		// `hasError` is what separates the two states at render time.
		const next = applyCommentsResult(INITIAL_COMMENTS_STATE, {
			success: false,
			error: "Too many requests. Please wait 45 seconds.",
		});

		expect(next.isLoading).toBe(false);
		expect(next.hasError).toBe(true);
		expect(next.comments).toEqual([]);
	});

	it("clears the error and stores the rows on success", () => {
		const errored: CommentsFetchState = {
			comments: [],
			isLoading: false,
			hasError: true,
		};

		const next = applyCommentsResult(errored, {
			success: true,
			data: [aComment],
		});

		expect(next).toEqual({
			comments: [aComment],
			isLoading: false,
			hasError: false,
		});
	});

	it("keeps the comments already on screen when a refresh fails", () => {
		// A failed refresh after a submit must not blank a list the reader was
		// reading; only the initial load has nothing to fall back to.
		const next = applyCommentsResult(loaded, {
			success: false,
			error: "Too many requests.",
		});

		expect(next.comments).toEqual([aComment]);
		expect(next.hasError).toBe(true);
		expect(next.isLoading).toBe(false);
	});

	it("treats a success with no data as an empty, error-free list", () => {
		const next = applyCommentsResult(loaded, { success: true });

		expect(next.comments).toEqual([]);
		expect(next.hasError).toBe(false);
		expect(next.isLoading).toBe(false);
	});
});

describe("selectCommentsRender", () => {
	it("renders the loading branch before the first fetch settles", () => {
		expect(selectCommentsRender(INITIAL_COMMENTS_STATE)).toBe("loading");
	});

	it("renders the error block when the initial load fails", () => {
		// Nothing loaded, so there is nothing to keep and the reader has to be
		// told the read failed rather than shown an empty review.
		const failed = applyCommentsResult(INITIAL_COMMENTS_STATE, {
			success: false,
			error: "Too many requests. Please wait 45 seconds.",
		});

		expect(selectCommentsRender(failed)).toBe("error");
	});

	it("renders the retained list with a banner when a refresh fails", () => {
		// The finding: `applyCommentsResult` kept the rows, but the component
		// rendered the error *instead of* them, so the retention the module
		// documented was invisible. This is the case that a consumer has to
		// render, and the selector is where the decision now lives.
		const failed = applyCommentsResult(loaded, {
			success: false,
			error: "Too many requests.",
		});

		expect(failed.comments).toEqual([aComment]);
		expect(selectCommentsRender(failed)).toBe("list-with-error");
	});

	it("renders a plain list when the fetch succeeds with rows", () => {
		expect(selectCommentsRender(loaded)).toBe("list");
	});

	it("renders a plain list when the fetch succeeds with no rows", () => {
		// An empty review is a list with nothing in it, not an error: the two
		// must stay distinguishable in both directions.
		const empty = applyCommentsResult(loaded, { success: true });

		expect(selectCommentsRender(empty)).toBe("list");
	});
});

/**
 * The component's half of the contract.
 *
 * The selector above is the decision, but a decision nothing consumes is
 * exactly the gap `D2` was raised about: the module kept the rows, the
 * component rendered the error *instead of* them, and the state test still
 * passed. There is no React harness in this project to render the component
 * in, so the wiring is checked at the source level instead - the same way the
 * dictionary scan checks that the strings it moved are gone from the public
 * tree.
 *
 * These assertions are about the component *consuming* the selector, which is
 * the half that was missing: if the component goes back to deciding for
 * itself, these fail.
 */
describe("CommentSection render branches", () => {
	it("takes its render mode from the selector", () => {
		const source = collapsedComponentSource();

		// The component must not branch on `isLoading`/`hasError` itself any
		// more: that is the ternary that rendered the error block in place of
		// the rows the state module had kept.
		expect(/\bisLoading\s*\?/.test(source)).toBe(false);
		expect(/\bhasError\s*\?/.test(source)).toBe(false);
		expect(source.includes("selectCommentsRender(state)")).toBe(true);
	});

	it("renders the comment list in the list-with-error branch", () => {
		const source = collapsedComponentSource();

		expect(source.includes("<CommentList")).toBe(true);

		// The list has to be reachable in both list branches, or the rows a
		// failed refresh kept would still never reach the screen.
		const guard = guardBefore(source, "<CommentList");
		expect(guard.includes('renderMode === "list"')).toBe(true);
		expect(guard.includes('renderMode === "list-with-error"')).toBe(true);
	});

	it("shows the error block only in the error branch", () => {
		const source = collapsedComponentSource();

		// The error block is for a failure that retained nothing. If the
		// `list-with-error` branch rendered it as well, the banner would be
		// the only thing distinguishing a refresh failure from a first-load
		// failure, and the rows would be gone again.
		const guard = guardBefore(source, "dictionary.commentsLoadError");
		expect(guard.includes('renderMode === "error"')).toBe(true);
		expect(guard.includes("list-with-error")).toBe(false);
	});

	it("shows the refresh banner in the list-with-error branch", () => {
		const source = collapsedComponentSource();

		const guard = guardBefore(source, "dictionary.commentsRefreshError");
		expect(guard.includes('renderMode === "list-with-error"')).toBe(true);
	});
});
