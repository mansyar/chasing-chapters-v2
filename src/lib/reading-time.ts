/**
 * Reading-time estimation for the review detail page (`FR-5`).
 *
 * Pure functions over the same content the TOC reads: body plus structured
 * sections plus quotes, counted per locale. Copy stays in the dictionary — the
 * formatter takes the locale's template string, so this module never imports
 * the server-only dictionary and is safe to use from client components.
 */

import { formatMessage } from "./i18n/format";
import { extractLexicalText, type LexicalDocument } from "./toc-extract";

/** Words per minute both locales estimate at (spec assumption, v1). */
export const READING_WORDS_PER_MINUTE = 200;

/** Everything the estimate counts, mirroring the review detail page. */
export interface ReadingContentInput {
	body?: LexicalDocument | null;
	whatILoved?: LexicalDocument | null;
	whatCouldBeBetter?: LexicalDocument | null;
	perfectFor?: LexicalDocument | null;
	favoriteQuotes?: Array<{ quote: string }> | null;
}

/** Words in a plain string; blank input counts zero. */
export function countWords(text: string): number {
	const trimmed = text.trim();

	if (trimmed === "") {
		return 0;
	}

	return trimmed.split(/\s+/).length;
}

/** Words in a Lexical document; null or text-free documents count zero. */
export function countLexicalWords(
	content: LexicalDocument | null | undefined,
): number {
	return countWords(extractLexicalText(content));
}

/**
 * Words across the whole review: body, structured sections, and quotes.
 *
 * Each locale's content is counted independently, so the estimate recomputes
 * when the locale switches (`AC-5`).
 */
export function countReviewWords(input: ReadingContentInput): number {
	const quotes = (input.favoriteQuotes ?? []).map((item) =>
		countWords(item.quote),
	);

	return (
		countLexicalWords(input.body) +
		countLexicalWords(input.whatILoved) +
		countLexicalWords(input.whatCouldBeBetter) +
		countLexicalWords(input.perfectFor) +
		quotes.reduce((total, count) => total + count, 0)
	);
}

/**
 * Whole minutes at 200wpm, rounded up, floored at one.
 *
 * The floor keeps the badge from ever reading "0 min read" on short reviews.
 */
export function estimateReadingMinutes(input: ReadingContentInput): number {
	return Math.max(
		1,
		Math.ceil(countReviewWords(input) / READING_WORDS_PER_MINUTE),
	);
}

/**
 * Fills the dictionary's reading-time template, e.g. `"{minutes} min read"`.
 *
 * The `{minutes}` placeholder name follows the dictionary's existing
 * `{page}` / `{rating}` convention.
 */
export function formatReadingTime(minutes: number, template: string): string {
	return formatMessage(template, { minutes });
}
