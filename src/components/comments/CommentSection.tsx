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
	const { comments, isLoading, hasError } = state;

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
					{!isLoading && !hasError && `(${comments.length})`}
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
				{isLoading ? (
					<div className="text-center py-8 text-muted-foreground">
						{dictionary.commentsLoading}
					</div>
				) : hasError ? (
					// A rejected fetch is not an empty review: saying "no comments
					// yet" here hid a rate-limited read behind a plausible answer.
					<div className="text-center py-8 text-muted-foreground" role="alert">
						<p>{dictionary.commentsLoadError}</p>
					</div>
				) : (
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
