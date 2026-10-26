import { describe, expect, it } from "bun:test";
import {
	applyCommentsResult,
	type CommentSummary,
	type CommentsFetchState,
	INITIAL_COMMENTS_STATE,
} from "../comment-fetch-state";

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
