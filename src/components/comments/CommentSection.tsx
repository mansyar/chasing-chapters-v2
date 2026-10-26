/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { MessageCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApprovedComments } from "@/app/actions/comments";
import type { AppLocale } from "@/lib/date-format";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { CommentForm } from "./CommentForm";
import { CommentList } from "./CommentList";
import {
	applyCommentsResult,
	INITIAL_COMMENTS_STATE,
	selectCommentsRender,
} from "./comment-fetch-state";

interface CommentSectionProps {
	reviewId: number;
	/** UI language for relative timestamps; defaults to English. */
	locale?: AppLocale;
	dictionary: Dictionary;
}

export function CommentSection({
	reviewId,
	locale = "en",
	dictionary,
}: CommentSectionProps) {
	const [state, setState] = useState(INITIAL_COMMENTS_STATE);
	const { comments } = state;
	const renderMode = selectCommentsRender(state);

	const fetchComments = useCallback(async () => {
		const result = await getApprovedComments(reviewId);
		setState((previous) => applyCommentsResult(previous, result));
	}, [reviewId]);

	useEffect(() => {
		fetchComments();
	}, [fetchComments]);

	const handleCommentSubmitted = () => {
		// Refresh comments when a new one is submitted and approved
		fetchComments();
	};

	return (
		<section className="container mx-auto px-6 md:px-12 lg:px-24 py-12 max-w-4xl">
			<div className="flex items-center gap-2 mb-8">
				<MessageCircle className="h-6 w-6 text-primary" />
				<h2 className="font-serif text-2xl font-bold">
					{dictionary.commentsTitle}{" "}
					{(renderMode === "list" || renderMode === "list-with-error") &&
						`(${comments.length})`}
				</h2>
			</div>

			<div className="space-y-8">
				{/* Comment Form */}
				<div className="rounded-xl border bg-card/50 p-6">
					<CommentForm
						reviewId={reviewId}
						onCommentSubmitted={handleCommentSubmitted}
						dictionary={dictionary}
					/>
				</div>

				{/* Comments List */}
				{renderMode === "loading" && (
					<div className="text-center py-8 text-muted-foreground">
						{dictionary.commentsLoading}
					</div>
				)}

				{renderMode === "error" && (
					// A rejected initial load is not an empty review: saying "no
					// comments yet" here hid a rate-limited read behind a plausible
					// answer.
					<div className="text-center py-8 text-muted-foreground" role="alert">
						<p>{dictionary.commentsLoadError}</p>
					</div>
				)}

				{renderMode === "list-with-error" && (
					// A refresh failed after the list was already on screen. The
					// rows below are the ones the reader already had, so the failure
					// is reported above them rather than in place of them.
					<div
						className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
						role="status"
					>
						{dictionary.commentsRefreshError}
					</div>
				)}

				{(renderMode === "list" || renderMode === "list-with-error") && (
					<CommentList
						comments={comments}
						locale={locale}
						dictionary={dictionary}
					/>
				)}
			</div>
		</section>
	);
}
