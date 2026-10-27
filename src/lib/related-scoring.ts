/**
 * Weighted affinity scoring and picks-first merge for the RelatedReviews rail.
 *
 * Pure, framework-free helpers: overlap counts and eligibility flags go in,
 * ranked slugs come out. Eligibility itself (`publishedAndVisibleWhere`, the
 * current-review exclusion) stays in the Phase 2 query layer, which marks
 * each pick and candidate with an `eligible` flag before calling in.
 */

export const RELATED_GENRE_WEIGHT = 3;
export const RELATED_TAG_WEIGHT = 2;
export const RELATED_MOOD_WEIGHT = 1;

/** The rail shows at most this many reviews when no explicit limit is given. */
export const DEFAULT_RELATED_LIMIT = 3;

/** Overlap counts between the current review and one candidate. */
export interface AffinityOverlap {
	sharedGenres: number;
	sharedTags: number;
	sharedMoods: number;
}

/**
 * Scores one candidate from its overlap counts: 3 per shared genre plus
 * 2 per shared tag plus 1 per shared mood.
 */
export function scoreAffinityOverlap(overlap: AffinityOverlap): number {
	return (
		overlap.sharedGenres * RELATED_GENRE_WEIGHT +
		overlap.sharedTags * RELATED_TAG_WEIGHT +
		overlap.sharedMoods * RELATED_MOOD_WEIGHT
	);
}

/** One affinity candidate plus the fields ranking needs. */
export interface AffinityCandidate extends AffinityOverlap {
	slug: string;
	/** ISO timestamp; missing or unparsable sorts last on score ties. */
	publishDate?: string | null;
	/** False for unpublished, scheduled-future, self, or otherwise hidden. */
	eligible: boolean;
}

/** A candidate with its computed score, newest-first ready. */
export interface ScoredAffinityCandidate {
	slug: string;
	score: number;
	publishDate?: string | null;
}

/**
 * The ids of a relationship field that holds populated docs, raw ids, or a
 * mix of both. Non-numeric entries contribute nothing, so a corrupt row can
 * neither match nor crash the overlap count.
 */
export function idsOf(
	values: Array<number | { id: number } | null> | null | undefined,
): number[] {
	const ids: number[] = [];

	for (const value of values ?? []) {
		const id = typeof value === "number" ? value : value?.id;
		if (typeof id === "number" && Number.isFinite(id)) {
			ids.push(id);
		}
	}

	return ids;
}

/**
 * Parses an ISO timestamp for tiebreak comparison. Missing or unparsable
 * values sort as the oldest, so undated candidates lose every recency tie.
 */
function publishTime(value: string | null | undefined): number {
	if (value === undefined || value === null) {
		return Number.NEGATIVE_INFINITY;
	}
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Ranks eligible candidates by score descending, then newest `publishDate`
 * first, then slug ascending, so the order is fully deterministic (FR-3).
 */
export function rankAffinityCandidates(
	candidates: AffinityCandidate[],
): ScoredAffinityCandidate[] {
	return candidates
		.filter((candidate) => candidate.eligible)
		.map((candidate) => ({
			slug: candidate.slug,
			score: scoreAffinityOverlap(candidate),
			publishDate: candidate.publishDate,
		}))
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			// Explicit comparison (never subtraction): two missing dates are
			// both -Infinity, and -Infinity minus itself is NaN, which would
			// skip the slug tiebreak and inherit the query order.
			const aTime = publishTime(a.publishDate);
			const bTime = publishTime(b.publishDate);
			if (aTime !== bTime) {
				return bTime - aTime;
			}
			if (a.slug === b.slug) {
				return 0;
			}
			return a.slug < b.slug ? -1 : 1;
		});
}

/** One author pick in stored order, with its eligibility resolved by the caller. */
export interface RelatedPick {
	slug: string;
	/** False for unpublished, scheduled-future, self, or otherwise hidden. */
	eligible: boolean;
}

/**
 * Merges author picks with affinity backfill into at most `limit` slugs.
 *
 * Eligible picks lead in stored order; affinity fills the remaining slots
 * and never re-adds a pick. Picks beyond the limit are dropped before
 * affinity is even ranked, so a full pick list costs no scoring work.
 */
export function mergeRelatedReviews(
	picks: RelatedPick[],
	candidates: AffinityCandidate[],
	limit: number = DEFAULT_RELATED_LIMIT,
): string[] {
	const merged: string[] = [];
	const seen = new Set<string>();

	for (const pick of picks) {
		if (merged.length >= limit) {
			break;
		}
		if (!pick.eligible || seen.has(pick.slug)) {
			continue;
		}
		seen.add(pick.slug);
		merged.push(pick.slug);
	}

	if (merged.length < limit) {
		for (const candidate of rankAffinityCandidates(candidates)) {
			if (merged.length >= limit) {
				break;
			}
			if (seen.has(candidate.slug)) {
				continue;
			}
			seen.add(candidate.slug);
			merged.push(candidate.slug);
		}
	}

	return merged;
}
