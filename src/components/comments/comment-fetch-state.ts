/**
 * The state `CommentSection` holds for its comment list, and the render mode
 * derived from it.
 *
 * Kept out of the component so the branches that matter can be tested: a
 * rejected fetch has to be distinguishable from a review that has no comments.
 * Rendering the two the same way is what turned a rate-limited fetch into
 * "no comments yet".
 *
 * A failure is two different situations, and `selectCommentsRender` is what
 * tells them apart:
 *
 * - the **initial load** failed, so nothing is on screen to fall back to - the
 *   error block;
 * - a **refresh** failed while comments were already on screen - the rows are
 *   kept and the failure is reported in a banner above them, because blanking
 *   a list the reader was reading is the outcome this module exists to prevent.
 */

/** The fields the comment list renders. */
export interface CommentSummary {
	id: number;
	authorName: string;
	content: string;
	createdAt: string;
}

export interface CommentsFetchState {
	comments: CommentSummary[];
	isLoading: boolean;
	hasError: boolean;
}

/**
 * The shape `getApprovedComments` returns, structurally.
 *
 * Declared here rather than imported so this module - and its test - stay free
 * of the `"use server"` action module. `success` is a plain `boolean` because
 * that is what the action's inferred return type widens to; the branch below
 * reads it as the discriminator.
 */
export interface CommentsFetchResult {
	success: boolean;
	data?: CommentSummary[];
	error?: string;
}

export const INITIAL_COMMENTS_STATE: CommentsFetchState = {
	comments: [],
	isLoading: true,
	hasError: false,
};

/**
 * Applies a fetch result to the current state.
 *
 * A failure sets `hasError` instead of leaving the list looking merely empty,
 * and keeps any comments already on screen: a refresh that fails after a
 * submit must not blank a list the reader was reading.
 */
export function applyCommentsResult(
	previous: CommentsFetchState,
	result: CommentsFetchResult,
): CommentsFetchState {
	if (result.success) {
		return {
			comments: result.data ?? [],
			isLoading: false,
			hasError: false,
		};
	}

	return {
		comments: previous.comments,
		isLoading: false,
		hasError: true,
	};
}

/** What `CommentSection` renders below the form. */
export type CommentsRenderMode =
	/** The first fetch has not settled, so nothing is known yet. */
	| "loading"
	/** Nothing loaded, and there is nothing to fall back to. */
	| "error"
	/** Rows are shown, with a banner saying the last refresh failed. */
	| "list-with-error"
	/** Rows are shown and the last fetch succeeded. */
	| "list";

/**
 * Decides which of the four branches `CommentSection` renders.
 *
 * `hasError` alone cannot choose: a failed refresh keeps the rows it already
 * had, so the error has to be reported *alongside* them rather than instead of
 * them. Only a failure that retained nothing is an error block.
 */
export function selectCommentsRender(
	state: CommentsFetchState,
): CommentsRenderMode {
	if (state.isLoading) {
		return "loading";
	}

	if (!state.hasError) {
		return "list";
	}

	return state.comments.length > 0 ? "list-with-error" : "error";
}
