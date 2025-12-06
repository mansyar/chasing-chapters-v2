/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { CommentForm } from "./CommentForm";
import { CommentList } from "./CommentList";
import { getApprovedComments } from "@/app/actions/comments";

interface Comment {
  id: number;
  authorName: string;
  content: string;
  createdAt: string;
}

interface CommentSectionProps {
  reviewId: number;
}

export function CommentSection({ reviewId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    const result = await getApprovedComments(reviewId);
    if (result.success && result.data) {
      setComments(result.data);
    }
    setIsLoading(false);
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
          Comments {!isLoading && `(${comments.length})`}
        </h2>
      </div>

      <div className="space-y-8">
        {/* Comment Form */}
        <div className="rounded-xl border bg-card/50 p-6">
          <CommentForm
            reviewId={reviewId}
            onCommentSubmitted={handleCommentSubmitted}
          />
        </div>

        {/* Comments List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading comments...
          </div>
        ) : (
          <CommentList comments={comments} />
        )}
      </div>
    </section>
  );
}
