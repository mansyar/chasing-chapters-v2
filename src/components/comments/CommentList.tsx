"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Flag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportComment } from "@/app/actions/comments";

interface Comment {
  id: number;
  authorName: string;
  content: string;
  createdAt: string;
}

interface CommentListProps {
  comments: Comment[];
}

export function CommentList({ comments }: CommentListProps) {
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reportEmail, setReportEmail] = useState("");
  const [reportMessage, setReportMessage] = useState<{
    id: number;
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleReport = async (commentId: number) => {
    if (!reportEmail || !reportEmail.includes("@")) {
      setReportMessage({
        id: commentId,
        type: "error",
        text: "Please enter a valid email",
      });
      return;
    }

    const result = await reportComment(commentId, reportEmail);

    if (result.success) {
      setReportMessage({
        id: commentId,
        type: "success",
        text: result.message || "Report submitted",
      });
      setReportingId(null);
      setReportEmail("");
      // Clear message after 3 seconds
      setTimeout(() => setReportMessage(null), 3000);
    } else {
      setReportMessage({
        id: commentId,
        type: "error",
        text: result.error,
      });
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
                    {formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {/* Report button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setReportingId(
                      reportingId === comment.id ? null : comment.id
                    )
                  }
                  title="Report comment"
                >
                  <Flag className="h-4 w-4" />
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

              {/* Report message */}
              {reportMessage && reportMessage.id === comment.id && (
                <p
                  className={`mt-2 text-xs ${
                    reportMessage.type === "success"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {reportMessage.text}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
