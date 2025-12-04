"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitComment } from "@/app/actions/comments";
import { Send, Loader2, CheckCircle, Clock } from "lucide-react";

interface CommentFormProps {
  reviewId: number;
  onCommentSubmitted?: () => void;
}

export function CommentForm({
  reviewId,
  onCommentSubmitted,
}: CommentFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "pending" | "error";
    text: string;
  } | null>(null);

  // Load saved name/email from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem("commenter_name");
    const savedEmail = localStorage.getItem("commenter_email");
    if (savedName) setName(savedName);
    if (savedEmail) setEmail(savedEmail);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const result = await submitComment({
      name,
      email,
      content,
      reviewId,
    });

    setIsSubmitting(false);

    if (result.success) {
      // Save name/email to localStorage for convenience
      localStorage.setItem("commenter_name", name);
      localStorage.setItem("commenter_email", email);

      // Clear content field
      setContent("");

      // Show appropriate message
      const status = result.data?.status;
      setMessage({
        type: status === "approved" ? "success" : "pending",
        text: result.message || "Comment submitted!",
      });

      // Notify parent to refresh comments
      if (status === "approved") {
        onCommentSubmitted?.();
      }

      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
    } else {
      setMessage({
        type: "error",
        text: result.error,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="font-serif text-xl font-bold">Leave a Comment</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="bg-background"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-background"
          />
          <p className="text-xs text-muted-foreground">
            Your email won&apos;t be published
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="content" className="text-sm font-medium">
          Comment
        </label>
        <Textarea
          id="content"
          placeholder="Share your thoughts..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          className="bg-background"
        />
        <p className="text-xs text-muted-foreground text-right">
          {content.length}/2000
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300"
              : message.type === "pending"
              ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
              : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : message.type === "pending" ? (
            <Clock className="h-4 w-4 shrink-0" />
          ) : null}
          {message.text}
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit Comment
          </>
        )}
      </Button>
    </form>
  );
}
