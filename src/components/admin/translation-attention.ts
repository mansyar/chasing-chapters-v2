// Attention-list logic for the translation feedback surfaces (Phase 2).
// Pure logic — no React, no network — so it stays fully unit-testable.
//
// "Needs attention" covers FR-3: `failed`, `stale`, and reviews stuck in
// `pending` for longer than the threshold.
//
// Stuck-pending timestamps: marking a review `pending` does NOT write
// `translationUpdatedAt` (only the translated/failed outcomes do), so the
// stuck timer compares against the document's `updatedAt` — the update that
// flipped the status to `pending` bumps it. The timer restarts if the author
// edits the document while the pipeline is still pending; this is accepted,
// documented behavior rather than a bug.

import type { Where } from "payload";
import {
	classifyTranslationError,
	TRANSLATION_ERROR_KINDS,
	type TranslationErrorKind,
} from "@/lib/translation-errors";

/** Shared poll interval for the edit-view poller and the attention bell. */
export const TRANSLATION_POLL_INTERVAL_MS = 20 * 1000;

/** A review stuck in `pending` older than this needs attention (FR-3). */
export const TRANSLATION_STUCK_PENDING_MS = 24 * 60 * 60 * 1000;

/** Bounded query size for the attention list (NFR-4). */
export const TRANSLATION_ATTENTION_LIMIT = 20;

/** Statuses that always need attention, regardless of timestamps. */
export const ATTENTION_STATUSES = ["failed", "stale"] as const;

export interface TranslationAttentionInput {
	translationStatus?: string | null | undefined;
	/** The document's own modification timestamp. */
	documentUpdatedAt?: string | Date | null | undefined;
	thresholdMs?: number | undefined;
	now?: string | Date | undefined;
}

/**
 * Decide whether one review's translation needs attention: `failed`,
 * `stale`, or `pending` whose document timestamp is older than the threshold.
 * The stuck boundary is exclusive: exactly at the threshold is not yet
 * attention ("older than 24 hours"). A `pending` review with no (valid)
 * timestamp cannot be age-dated and is never surfaced.
 */
export function needsTranslationAttention(
	input: TranslationAttentionInput,
): boolean {
	const status = input.translationStatus;
	if (!status) return false;
	if ((ATTENTION_STATUSES as readonly string[]).includes(status)) return true;
	if (status !== "pending") return false;
	if (!input.documentUpdatedAt) return false;
	const modified = new Date(input.documentUpdatedAt);
	if (Number.isNaN(modified.getTime())) return false;
	const threshold = input.thresholdMs ?? TRANSLATION_STUCK_PENDING_MS;
	const now = input.now === undefined ? new Date() : new Date(input.now);
	if (Number.isNaN(now.getTime())) return false;
	return now.getTime() - modified.getTime() > threshold;
}

/**
 * Build the REST `where` clause for the attention list query: every
 * `failed` or `stale` review, plus `pending` reviews whose document was
 * last modified before the cutoff (`now - threshold`).
 */
export function buildAttentionWhere(
	now: string | Date = new Date(),
	thresholdMs: number = TRANSLATION_STUCK_PENDING_MS,
): Where {
	const cutoff = new Date(new Date(now).getTime() - thresholdMs).toISOString();
	return {
		or: [
			{ translationStatus: { equals: "failed" } },
			{ translationStatus: { equals: "stale" } },
			{
				and: [
					{ translationStatus: { equals: "pending" } },
					{ updatedAt: { less_than: cutoff } },
				],
			},
		],
	};
}

/** Edit-view URL for a review document (bell entries link here). */
export function buildReviewEditURL(id: string | number): string {
	return `/admin/collections/reviews/${encodeURIComponent(String(id))}`;
}

/**
 * Badge label for the attention count: the exact number while it fits the
 * list limit, "<limit>+" once the list is truncated.
 */
export function formatAttentionBadgeLabel(
	count: number,
	limit: number = TRANSLATION_ATTENTION_LIMIT,
): string {
	return count > limit ? `${limit}+` : String(count);
}

export interface TranslationAttentionItem {
	id: string;
	title: string;
	translationStatus: string;
	editURL: string;
	/** The stored failure message, when the pipeline recorded a non-blank one. */
	translationError: string | null;
	/**
	 * Failure kind recovered from `translationError` (FR-9). `null` for a row
	 * with no stored message — a `stale` or stuck-`pending` review is not a
	 * failure of any kind.
	 */
	errorKind: TranslationErrorKind | null;
}

/** Shape of one raw REST list doc — deliberately tolerant. */
interface AttentionCandidateDoc {
	id?: unknown;
	title?: unknown;
	translationStatus?: unknown;
	updatedAt?: unknown;
	translationError?: unknown;
}

/**
 * Map/filter a raw REST docs array down to the attention entries the bell
 * renders. Unknown shapes, missing ids/statuses, and non-attention reviews
 * are dropped silently.
 */
export function extractAttentionDocs(
	docs: readonly unknown[],
	now: string | Date = new Date(),
	thresholdMs: number = TRANSLATION_STUCK_PENDING_MS,
): TranslationAttentionItem[] {
	const items: TranslationAttentionItem[] = [];
	for (const doc of docs) {
		if (typeof doc !== "object" || doc === null) continue;
		const candidate = doc as AttentionCandidateDoc;
		const status = asString(candidate.translationStatus);
		const id =
			typeof candidate.id === "number" || typeof candidate.id === "string"
				? String(candidate.id)
				: null;
		if (!status || !id) continue;
		if (
			!needsTranslationAttention({
				translationStatus: status,
				documentUpdatedAt: asDateValue(candidate.updatedAt),
				thresholdMs,
				now,
			})
		) {
			continue;
		}
		const translationError = asNonBlankString(candidate.translationError);
		items.push({
			id,
			title: asString(candidate.title) || `Review ${id}`,
			translationStatus: status,
			editURL: buildReviewEditURL(id),
			translationError,
			errorKind: deriveErrorKind(translationError),
		});
	}
	return items;
}

/** Per-kind failure counts over the attention rows the caller holds. */
export type AttentionKindCounts = Record<TranslationErrorKind, number>;

/**
 * All-zero counts. Spelled out rather than derived so that adding a kind to
 * `TRANSLATION_ERROR_KINDS` fails the typecheck here instead of silently
 * reporting zero for it — the renderer must never miss a kind.
 */
function emptyAttentionKindCounts(): AttentionKindCounts {
	return {
		quota: 0,
		network: 0,
		timeout: 0,
		credentials: 0,
		unexpected: 0,
	};
}

/**
 * Count attention rows by failure kind (FR-9).
 *
 * The breakdown describes the rows the caller passes in — for the bell, the
 * bounded page it fetched — never the whole backlog. `translationError` is free
 * text, so no `where` clause can filter by kind and there is no cheaper count
 * to take. Rows with no stored message contribute to no kind.
 */
export function summarizeAttentionErrorKinds(
	items: readonly TranslationAttentionItem[],
): AttentionKindCounts {
	const counts = emptyAttentionKindCounts();
	for (const item of items) {
		if (item.errorKind !== null) counts[item.errorKind] += 1;
	}
	return counts;
}

/**
 * Render lines for the bell (FR-9): one scope line naming the sample the counts
 * describe, then one line per failure kind present.
 *
 * The counts come from the fetched page, so the scope line names that page and,
 * when it is a truncated sample, names the true backlog alongside it. "3 quota"
 * read as a backlog total would be wrong and would drive the wrong response.
 * Quota gets its own line so an operator can tell "Google is throttling" from
 * "credentials are wrong" without reading logs.
 */
export function formatAttentionKindBreakdownLines(
	counts: AttentionKindCounts,
	shownCount: number,
	totalCount: number = shownCount,
): string[] {
	if (shownCount <= 0) return [];
	const reviews = `${shownCount} ${shownCount === 1 ? "review" : "reviews"}`;
	const scope =
		totalCount > shownCount
			? `Failure kinds across the ${reviews} shown, not the whole backlog of ${totalCount}:`
			: `Failure kinds across the ${reviews} shown:`;
	const entries = TRANSLATION_ERROR_KINDS.filter(
		(kind) => counts[kind] > 0,
	).map((kind) => `${counts[kind]} ${kind}`);
	return entries.length > 0 ? [scope, ...entries] : [scope, "none recorded"];
}

/**
 * Re-derive the failure kind from the stored `translationError` string, which
 * `formatTranslationError` wrote as "<actionable message> (raw: <detail>)".
 * Reusing the classifier keeps the persisted format the single source of truth:
 * no new field, no migration, no change to what the pipeline writes.
 *
 * The classifier already falls back to `unexpected` for anything it cannot
 * name, so a present-but-unrecognised message still gets a kind and this never
 * throws. A missing or blank message is not a message at all — no kind.
 */
function deriveErrorKind(message: string | null): TranslationErrorKind | null {
	if (message === null) return null;
	return classifyTranslationError(new Error(message)).kind;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

/** A string with content; whitespace-only counts as absent. */
function asNonBlankString(value: unknown): string | null {
	const text = asString(value);
	if (text === null || text.trim() === "") return null;
	return text;
}

function asDateValue(value: unknown): string | Date | null {
	if (typeof value === "string") return value;
	if (value instanceof Date) return value;
	return null;
}
