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
}

/** Shape of one raw REST list doc — deliberately tolerant. */
interface AttentionCandidateDoc {
	id?: unknown;
	title?: unknown;
	translationStatus?: unknown;
	updatedAt?: unknown;
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
		items.push({
			id,
			title: asString(candidate.title) || `Review ${id}`,
			translationStatus: status,
			editURL: buildReviewEditURL(id),
		});
	}
	return items;
}

function asString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asDateValue(value: unknown): string | Date | null {
	if (typeof value === "string") return value;
	if (value instanceof Date) return value;
	return null;
}
