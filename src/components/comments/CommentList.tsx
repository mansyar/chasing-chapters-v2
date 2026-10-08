"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { reportComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/date-format";
import { formatRelativeTime } from "@/lib/date-format";

interface Comment {
	id: number;
	authorName: string;
	content: string;
	createdAt: string;
}

interface CommentListProps {
	comments: Comment[];
	/** UI language for relative timestamps; defaults to English. */
	locale?: AppLocale;
}

export function CommentList({ comments, locale = "en" }: CommentListProps) {
	const [reportingId, setReportingId] = useState<number | null>(null);
	const [reportEmail, setReportEmail] = useState("");

	const handleReport = async (commentId: number) => {
		if (!reportEmail || !reportEmail.includes("@")) {
			toast.error("Please enter a valid email");
			return;
		}

		const result = await reportComment(commentId, reportEmail);

		if (result.success) {
			toast.success(result.message || "Report submitted");
			setReportingId(null);
			setReportEmail("");
		} else {
			toast.error(result.error);
		}
	};

	if (comments.length === 0) {
		return (
			<div className="text-center py-12 text-muted-foreground">
				<p>No comments yet. Be the first to share your thoughts!</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{comments.map((comment) => (
				<div
					key={comment.id}
					className="group rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
				>
					<div className="flex items-start gap-3">
						{/* Avatar */}
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
							{comment.authorName.charAt(0).toUpperCase()}
						</div>

						{/* Content */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-medium">{comment.authorName}</span>
									<span className="text-xs text-muted-foreground">
										{formatRelativeTime(comment.createdAt, locale)}
									</span>
								</div>

								{/* Report button */}
								<Button
									variant="ghost"
									size="sm"
									className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
									onClick={() =>
										setReportingId(
											reportingId === comment.id ? null : comment.id,
										)
									}
									title="Report comment"
								>
									<Flag className="h-4 w-4" />
									<span className="sr-only">Report comment</span>
								</Button>
							</div>

							<p className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap">
								{comment.content}
							</p>

							{/* Report form */}
							{reportingId === comment.id && (
								<div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-2">
									<p className="text-xs text-muted-foreground">
										Report this comment as inappropriate
									</p>
									<div className="flex gap-2">
										<Input
											type="email"
											placeholder="Your email (for verification)"
											aria-label="Your email (for verification)"
											value={reportEmail}
											onChange={(e) => setReportEmail(e.target.value)}
											className="text-sm h-8"
										/>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => handleReport(comment.id)}
											className="h-8"
										>
											Report
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setReportingId(null);
												setReportEmail("");
											}}
											className="h-8"
										>
											Cancel
										</Button>
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
