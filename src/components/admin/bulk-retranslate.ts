// Pure helpers for the bulk re-translate action (FR-4). No React, no
// network — so the selection rules and the outcome reporting stay fully
// unit-testable.
//
// The type import below is type-only on purpose: it is erased at build time,
// so this module stays free of server-only imports and can be bundled into
// the admin client component.

import type { Where } from "payload";
import type { BulkRetranslateOutcome } from "@/lib/retranslate";

/**
 * How many reviews the bulk action may select at once. Mirrors the
 * server-side cap (BULK_RETRANSLATE_MAX_IDS in src/lib/retranslate.ts).
 */
export const BULK_RETRANSLATE_SELECTION_LIMIT = 50;

/**
 * REST where-clause for the reviews a bulk re-translate can act on: the
 * `failed` and `stale` ones. Reviews in any other status are skipped by the
 * server with a reason.
 */
export function buildBulkCandidateWhere(): Where {
	return {
		or: [
			{ translationStatus: { equals: "failed" } },
			{ translationStatus: { equals: "stale" } },
		],
	};
}

export interface BulkOutcomeSummary {
	/** Number of reviews the run reported on. */
	total: number;
	translated: number;
	failed: number;
	skipped: number;
	/** One-line summary of the run, ready to show to the author. */
	message: string;
}

/**
 * Count the per-review outcomes of a bulk re-translate run and build the
 * headline message. A run with no outcome at all reports nothing done.
 */
export function summarizeBulkOutcomes(
	outcomes: readonly BulkRetranslateOutcome[],
): BulkOutcomeSummary {
	let translated = 0;
	let failed = 0;
	let skipped = 0;

	for (const outcome of outcomes) {
		if (outcome.status === "translated") translated += 1;
		else if (outcome.status === "failed") failed += 1;
		else skipped += 1;
	}

	const total = outcomes.length;
	if (total === 0) {
		return { total, translated, failed, skipped, message: "Nothing to do" };
	}

	const parts: string[] = [];
	if (translated > 0) {
		parts.push(`${translated} translated`);
	}
	if (failed > 0) {
		parts.push(`${failed} failed`);
	}
	if (skipped > 0) {
		parts.push(`${skipped} skipped`);
	}

	return {
		total,
		translated,
		failed,
		skipped,
		message: `${total} review${total === 1 ? "" : "s"}: ${parts.join(", ")}`,
	};
}

/**
 * One readable line per reviewed outcome, failures and skips first so the
 * problems the author has to act on are not buried under the successes.
 */
export function formatBulkOutcomeLines(
	outcomes: readonly BulkRetranslateOutcome[],
): string[] {
	const rank: Record<BulkRetranslateOutcome["status"], number> = {
		failed: 0,
		skipped: 1,
		translated: 2,
	};

	return [...outcomes]
		.sort((a, b) => rank[a.status] - rank[b.status])
		.map((outcome) => {
			const label =
				outcome.status === "translated"
					? "translated"
					: outcome.status === "failed"
						? "failed"
						: "skipped";
			const reason = outcome.reason ? ` — ${outcome.reason}` : "";
			return `Review ${outcome.id}: ${label}${reason}`;
		});
}
