"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionary";

interface QuoteShareButtonsProps {
	quote: string;
	bookTitle: string;
	dictionary: Dictionary;
}

/**
 * Share payload for a favorite quote (`FR-6`).
 */
export interface QuoteShareData {
	title: string;
	text: string;
	url: string;
}

/**
 * Tries `share` first and falls back to `copy`.
 *
 * Resolving shares and `AbortError` dismissals never touch the clipboard;
 * only a missing `share` or a non-abort failure falls through to `copy`.
 * Extracted so `bun test` can stub `navigator.share` without a DOM harness.
 */
export async function shareQuoteWithFallback(args: {
	data: QuoteShareData;
	share?: (data: QuoteShareData) => Promise<void>;
	copy: () => Promise<void>;
}): Promise<void> {
	if (typeof args.share === "function") {
		try {
			await args.share(args.data);
			return;
		} catch (error) {
			// Dismissing the share sheet is not a failure; anything else
			// falls through to the clipboard copy below.
			if (error instanceof DOMException && error.name === "AbortError") {
				return;
			}
		}
	}

	await args.copy();
}

/**
 * Per-quote copy + share buttons (`FR-6`).
 *
 * Copies `"<quote>" — <book> <url>` to the clipboard with sonner feedback,
 * following the existing `ShareButton` pattern. When `navigator.share` is
 * available the share button invokes it; otherwise it falls back to the same
 * clipboard copy so both buttons always do something.
 */
export function QuoteShareButtons({
	quote,
	bookTitle,
	dictionary,
}: QuoteShareButtonsProps) {
	const [copied, setCopied] = useState(false);
	const shareText = `"${quote}" — ${bookTitle}`;

	async function copyQuote(): Promise<void> {
		try {
			await navigator.clipboard.writeText(
				`${shareText} ${window.location.href}`,
			);
			setCopied(true);
			toast.success(dictionary.shareLinkCopied);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(dictionary.shareCopyFailed);
		}
	}

	async function shareQuote(): Promise<void> {
		const url = window.location.href;

		await shareQuoteWithFallback({
			data: { title: bookTitle, text: shareText, url },
			share:
				typeof navigator.share === "function"
					? (payload) => navigator.share(payload)
					: undefined,
			copy: copyQuote,
		});
	}

	return (
		<div className="flex flex-wrap gap-2">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={copyQuote}
				aria-live="polite"
				className="min-h-[44px]"
			>
				{copied ? (
					<Check className="h-4 w-4 text-green-600" aria-hidden="true" />
				) : (
					<Copy className="h-4 w-4" aria-hidden="true" />
				)}
				<span className={copied ? "text-green-600" : undefined}>
					{copied ? dictionary.shareCopied : dictionary.reviewCopyQuote}
				</span>
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={shareQuote}
				className="min-h-[44px]"
			>
				<Share2 className="h-4 w-4" aria-hidden="true" />
				<span>{dictionary.reviewShareQuote}</span>
			</Button>
		</div>
	);
}
