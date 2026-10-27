"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Dictionary } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

interface CopyLinkButtonProps {
	slug: string;
	dictionary: Dictionary;
	className?: string;
}

/**
 * Hover/focus copy-link affordance for a section heading (`FR-4`).
 *
 * Copies the absolute URL including the hash and pushes the hash into history
 * without a reload. The parent heading carries `group` so the button can stay
 * subtle on desktop (`lg:opacity-0` until hover/focus) while remaining always
 * visible to touch and keyboard users.
 */
export function CopyLinkButton({
	slug,
	dictionary,
	className,
}: CopyLinkButtonProps) {
	const [copied, setCopied] = useState(false);

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(
				new URL(`#${slug}`, window.location.href).toString(),
			);
			setCopied(true);
			toast.success(dictionary.shareLinkCopied);
			window.history.pushState(null, "", `#${slug}`);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(dictionary.shareCopyFailed);
		}
	}

	return (
		<button
			type="button"
			onClick={copyLink}
			aria-label={dictionary.reviewCopyLink}
			title={dictionary.reviewCopyLink}
			className={cn(
				"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
				className,
			)}
		>
			{copied ? (
				<Check className="h-4 w-4 text-green-600" aria-hidden="true" />
			) : (
				<Link2 className="h-4 w-4" aria-hidden="true" />
			)}
		</button>
	);
}
