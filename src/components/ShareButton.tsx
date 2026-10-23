"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

interface ShareButtonProps {
	title: string;
	url?: string;
	className?: string;
	dictionary: Dictionary;
}

export function ShareButton({
	title,
	url,
	className,
	dictionary,
}: ShareButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleShare = async () => {
		const shareUrl = url || window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({
					title: title,
					url: shareUrl,
				});
				return;
			} catch (err) {
				console.error("Error sharing:", err);
			}
		}

		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			toast.success(dictionary.shareLinkCopied);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
			toast.error(dictionary.shareCopyFailed);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			className={cn("gap-2 transition-all", className)}
			onClick={handleShare}
			aria-live="polite"
		>
			{copied ? (
				<>
					<Check className="h-4 w-4 text-green-600" />
					<span className="text-green-600">{dictionary.shareCopied}</span>
				</>
			) : (
				<>
					<Share2 className="h-4 w-4" />
					<span>{dictionary.shareShare}</span>
				</>
			)}
		</Button>
	);
}
