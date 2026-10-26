/**
 * The state `CommentSection` holds for its comment list.
 *
 * Kept out of the component so the branch that matters can be tested: a
 * rejected fetch has to be distinguishable from a review that has no comments.
 * Rendering the two the same way is what turned a rate-limited fetch into
 * "no comments yet".
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
