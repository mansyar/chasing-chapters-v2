/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { submitComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Dictionary } from "@/lib/i18n/dictionary";

interface CommentFormProps {
	reviewId: number;
	onCommentSubmitted?: () => void;
	dictionary: Dictionary;
}

export function CommentForm({
	reviewId,
	onCommentSubmitted,
	dictionary,
}: CommentFormProps) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [content, setContent] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Load saved name/email from localStorage
	useEffect(() => {
		try {
			const savedName = localStorage.getItem("commenter_name");
			const savedEmail = localStorage.getItem("commenter_email");
			if (savedName) setName(savedName);
			if (savedEmail) setEmail(savedEmail);
		} catch {
			// localStorage may be disabled or blocked
		}
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		const result = await submitComment({
			name,
			email,
			content,
			reviewId,
		});

		setIsSubmitting(false);

		if (result.success) {
			// Save name/email to localStorage for convenience
			try {
				localStorage.setItem("commenter_name", name);
				localStorage.setItem("commenter_email", email);
			} catch {
				// Ignore localStorage errors
			}

			// Clear content field
			setContent("");

			// Show appropriate toast (sonner auto-dismisses; 5s keeps prior timing)
			const status = result.data?.status;
			const text = result.message || dictionary.commentsSubmitted;
			if (status === "approved") {
				toast.success(text, { duration: 5000 });
			} else {
				toast.warning(text, { duration: 5000 });
			}

			// Notify parent to refresh comments
			if (status === "approved") {
				onCommentSubmitted?.();
			}
		} else {
			toast.error(result.error, { duration: 5000 });
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<h3 className="font-serif text-xl font-bold">
				{dictionary.commentsFormTitle}
			</h3>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<label htmlFor="name" className="text-sm font-medium">
						{dictionary.commentsName}
					</label>
					<Input
						id="name"
						placeholder={dictionary.commentsNamePlaceholder}
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						minLength={2}
						className="bg-background"
					/>
				</div>
				<div className="space-y-2">
					<label htmlFor="email" className="text-sm font-medium">
						{dictionary.commentsEmail}
					</label>
					<Input
						id="email"
						type="email"
						placeholder={dictionary.commentsEmailPlaceholder}
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						className="bg-background"
						aria-describedby="email-help"
					/>
					<p id="email-help" className="text-xs text-muted-foreground">
						{dictionary.commentsEmailHelp}
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<label htmlFor="content" className="text-sm font-medium">
					{dictionary.commentsComment}
				</label>
				<Textarea
					id="content"
					placeholder={dictionary.commentsCommentPlaceholder}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					required
					minLength={3}
					maxLength={2000}
					rows={4}
					className="bg-background"
					aria-describedby="content-help"
				/>
				<p
					id="content-help"
					className="text-xs text-muted-foreground text-right"
				>
					{content.length}/2000
				</p>
			</div>

			<Button
				type="submit"
				disabled={isSubmitting}
				className="w-full sm:w-auto"
			>
				{isSubmitting ? (
					<>
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						{dictionary.commentsSubmitting}
					</>
				) : (
					<>
						<Send className="h-4 w-4 mr-2" />
						{dictionary.commentsSubmit}
					</>
				)}
			</Button>
		</form>
	);
}
