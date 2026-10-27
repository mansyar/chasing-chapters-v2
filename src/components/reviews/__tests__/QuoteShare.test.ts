import { describe, expect, test } from "bun:test";
import { createElement } from "react";

import { renderStatic } from "@/components/__tests__/helpers/render-static";
import { getDictionary } from "@/lib/i18n/dictionary";
import { QuoteShareButtons, shareQuoteWithFallback } from "../QuoteShare";

describe("QuoteShareButtons", () => {
	test("renders localized copy and share buttons in the initial state", () => {
		const dictionary = getDictionary("en");
		const html = renderStatic(
			createElement(QuoteShareButtons, {
				quote: "A memorable line",
				bookTitle: "Example Book",
				dictionary,
			}),
		);
		expect(html).toContain(dictionary.reviewCopyQuote);
		expect(html).toContain(dictionary.reviewShareQuote);
		expect(html).not.toContain(dictionary.shareCopied);
	});

	test("quote buttons meet the touch-target baseline", () => {
		const dictionary = getDictionary("en");
		const html = renderStatic(
			createElement(QuoteShareButtons, {
				quote: "A memorable line",
				bookTitle: "Example Book",
				dictionary,
			}),
		);

		expect(html).toContain("min-h-[44px]");
	});

	test("a resolving navigator.share never touches the clipboard", async () => {
		let copied = false;
		let sharedWith: unknown;
		await shareQuoteWithFallback({
			data: {
				title: "Example Book",
				text: '"A memorable line" — Example Book',
				url: "https://example.test/reviews/slug",
			},
			share: async (payload) => {
				sharedWith = payload;
			},
			copy: async () => {
				copied = true;
			},
		});
		expect(sharedWith).toEqual({
			title: "Example Book",
			text: '"A memorable line" — Example Book',
			url: "https://example.test/reviews/slug",
		});
		expect(copied).toBe(false);
	});

	test("an AbortError dismissal swallows without falling back to copy", async () => {
		let copied = false;
		await shareQuoteWithFallback({
			data: {
				title: "Example Book",
				text: '"A memorable line" — Example Book',
				url: "https://example.test/reviews/slug",
			},
			share: async () => {
				throw new DOMException("Share dismissed", "AbortError");
			},
			copy: async () => {
				copied = true;
			},
		});
		expect(copied).toBe(false);
	});

	test("a non-abort share failure falls through to the clipboard copy", async () => {
		let copied = false;
		await shareQuoteWithFallback({
			data: {
				title: "Example Book",
				text: '"A memorable line" — Example Book',
				url: "https://example.test/reviews/slug",
			},
			share: async () => {
				throw new Error("Share unavailable");
			},
			copy: async () => {
				copied = true;
			},
		});
		expect(copied).toBe(true);
	});
});
