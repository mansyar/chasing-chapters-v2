import { getSpamReasons } from "./blocklist";

export type CommentModerationStatus = "approved" | "pending" | "rejected";

export interface ResolveCommentStatusInput {
	/** The raw comment content to scan for spam signals. */
	content: string;
	/** Whether the commenter is banned — always rejected. */
	banned: boolean;
	/** Whether the commenter is trusted (>= 3 approved comments) — bypasses the spam hold. */
	trusted: boolean;
}

export interface ModerationDecision {
	/** The moderation outcome to persist on the comment. */
	status: CommentModerationStatus;
	/** The spam signals matched against the content (empty for clean content). */
	spamSignals: string[];
}

/**
 * Single source of truth for comment approval policy:
 * - Banned commenters are always rejected.
 * - Clean content is auto-approved for everyone.
 * - Flagged content is held as pending, unless the commenter is trusted
 *   (trusted commenters get the benefit of the doubt, but signals are still
 *   recorded for admin visibility).
 */
export function resolveCommentStatus(
	input: ResolveCommentStatusInput,
): ModerationDecision {
	const spamSignals = getSpamReasons(input.content);

	if (input.banned) {
		return { status: "rejected", spamSignals };
	}

	if (spamSignals.length > 0 && !input.trusted) {
		return { status: "pending", spamSignals };
	}

	return { status: "approved", spamSignals };
}
