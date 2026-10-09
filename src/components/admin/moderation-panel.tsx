"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCommentStatus } from "@/app/actions/moderation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModerationComment } from "@/lib/moderation-summary";

type Props = {
	pendingCount: number;
	reportedCount: number;
	latest: ModerationComment[];
};

const STATUS_STYLES: Record<string, string> = {
	pending:
		"bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
	reported: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export function ModerationPanel({
	pendingCount,
	reportedCount,
	latest,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [busyId, setBusyId] = useState<ModerationComment["id"] | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleSetStatus(
		id: ModerationComment["id"],
		status: "approved" | "rejected",
	) {
		setBusyId(id);
		setError(null);
		const result = await setCommentStatus(id, status);
		setBusyId(null);
		if (!result.success) {
			setError(result.error || "Failed to update comment status");
			return;
		}
		startTransition(() => router.refresh());
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">
					Comment Moderation
				</CardTitle>
				<span className="text-2xl">💬</span>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-4 text-sm">
					<a
						href="/admin/collections/comments?where[status][equals]=pending"
						className="hover:underline"
					>
						<span className="font-bold">{pendingCount}</span> pending
					</a>
					<a
						href="/admin/collections/comments?where[status][equals]=reported"
						className="hover:underline"
					>
						<span className="font-bold">{reportedCount}</span> reported
					</a>
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}

				{latest.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nothing to moderate — all clear!
					</p>
				) : (
					<ul className="space-y-3">
						{latest.map((comment) => (
							<li key={comment.id} className="rounded-md border p-3 space-y-2">
								<div className="flex items-center justify-between gap-2 text-sm">
									<span className="font-medium">{comment.authorName}</span>
									<span
										className={`rounded-full px-2 py-0.5 text-xs font-medium ${
											STATUS_STYLES[comment.status] || ""
										}`}
									>
										{comment.status}
									</span>
								</div>
								<p className="text-sm text-muted-foreground line-clamp-2">
									{comment.content}
								</p>
								{Array.isArray(comment.spamSignals) &&
									comment.spamSignals.length > 0 && (
										<div className="flex flex-wrap gap-1">
											{comment.spamSignals.map((entry, i) => (
												<span
													key={`${comment.id}-signal-${i}`}
													className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
												>
													{entry?.signal}
												</span>
											))}
										</div>
									)}
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="default"
										disabled={isPending || busyId !== null}
										onClick={() => handleSetStatus(comment.id, "approved")}
									>
										{busyId === comment.id ? "Working…" : "Approve"}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={isPending || busyId !== null}
										onClick={() => handleSetStatus(comment.id, "rejected")}
									>
										Reject
									</Button>
									<a
										href={`/admin/collections/comments/${comment.id}`}
										className="text-xs text-blue-500 hover:underline"
									>
										Open
									</a>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
