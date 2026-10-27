import configPromise from "@payload-config";
import { getPayload, Where } from "payload";
import type { AppLocale } from "@/lib/date-format";
import { publishedAndVisibleWhere } from "@/lib/publish-visibility";
import type { AffinityCandidate, RelatedPick } from "@/lib/related-scoring";
import {
	DEFAULT_RELATED_LIMIT,
	idsOf,
	mergeRelatedReviews,
} from "@/lib/related-scoring";
import { Genre, MoodTag, Review, Tag } from "@/payload-types";
import {
	RelatedReviewsList,
	toAffinityCandidate,
	toRelatedPick,
} from "./RelatedReviewsList";

interface RelatedReviewsProps {
	currentReviewId: number;
	genres?: (Genre | number)[] | null;
	tags?: (Tag | number)[] | null;
	moodTags?: (MoodTag | number)[] | null;
	/**
	 * Author picks in stored order. Populated docs render directly; raw ids
	 * are resolved with one bounded read. Defaults to none.
	 */
	relatedReviews?: (number | Review)[] | null;
	/** UI language for the related cards' dates; defaults to English. */
	locale?: AppLocale;
}

/** One bounded affinity read: enough candidates to rank the top 3 from. */
export const AFFINITY_QUERY_LIMIT = 20;

export async function RelatedReviews({
	currentReviewId,
	genres = [],
	tags = [],
	moodTags = [],
	relatedReviews = [],
	locale = "en",
}: RelatedReviewsProps) {
	// 1. Extract IDs safely
	const genreIds = idsOf(genres);
	const tagIds = idsOf(tags);
	const moodTagIds = idsOf(moodTags);
	const storedPicks = relatedReviews ?? [];

	// 2. Build the affinity filter. It stays empty when the current review
	// has no taxonomy, in which case the query below is skipped entirely.
	const orConditions: Where[] = [];

	if (genreIds.length > 0) {
		orConditions.push({
			genres: {
				in: genreIds,
			},
		});
	}
	if (tagIds.length > 0) {
		orConditions.push({
			tags: {
				in: tagIds,
			},
		});
	}
	if (moodTagIds.length > 0) {
		orConditions.push({
			moodTags: {
				in: moodTagIds,
			},
		});
	}

	// Nothing authored and nothing to match on: the rail stays hidden
	// (existing empty-state behavior, FR-1).
	if (storedPicks.length === 0 && orConditions.length === 0) {
		return null;
	}

	const payload = await getPayload({ config: configPromise });
	const now = new Date();

	// 3. Resolve author picks in stored order. Populated docs are flagged
	// directly; raw ids take one bounded read first. Eligibility mirrors
	// `publishedAndVisibleWhere` through its in-memory shape plus the runtime
	// self guard (the CMS filter cannot cover already-saved rows).
	const pickDocsById = new Map<number, Review>();
	const unpopulatedPickIds = [
		...new Set(
			storedPicks
				.filter((entry): entry is number => typeof entry === "number")
				.filter((id) => id !== currentReviewId),
		),
	];

	if (unpopulatedPickIds.length > 0) {
		const { docs: fetchedPicks } = await payload.find({
			collection: "reviews",
			where: {
				id: {
					in: unpopulatedPickIds,
				},
			},
			limit: unpopulatedPickIds.length,
			depth: 1,
			locale,
		});

		for (const doc of fetchedPicks) {
			pickDocsById.set(doc.id, doc);
		}
	}

	const pickDocs: Review[] = [];

	for (const entry of storedPicks) {
		if (typeof entry === "number") {
			const doc = pickDocsById.get(entry);
			if (doc) {
				pickDocs.push(doc);
			}
		} else if (entry && typeof entry === "object") {
			pickDocs.push(entry);
		}
	}

	const picks: RelatedPick[] = pickDocs.map((doc) =>
		toRelatedPick(doc, currentReviewId, now),
	);

	// 4. One bounded affinity read over the taxonomy overlap, scored and
	// ranked in memory by `mergeRelatedReviews` (FR-2, FR-3, FR-5).
	let affinityDocs: Review[] = [];
	let candidates: AffinityCandidate[] = [];

	// Skip the read when eligible picks already fill the rail; the merge
	// below short-circuits the same way, so this only saves the query.
	const eligiblePickCount = picks.filter((pick) => pick.eligible).length;
	const affinityNeeded = eligiblePickCount < DEFAULT_RELATED_LIMIT;

	if (orConditions.length > 0 && affinityNeeded) {
		const { docs } = await payload.find({
			collection: "reviews",
			where: {
				and: [
					{
						id: {
							not_equals: currentReviewId,
						},
					},
					// A review scheduled for the future is not public, so it must
					// not surface here either: these cards are shown on a public
					// page.
					publishedAndVisibleWhere(now),
					{
						or: orConditions,
					},
				],
			},
			limit: AFFINITY_QUERY_LIMIT,
			// Newest-first so the bounded 20-newest window aligns with the
			// recency tiebreak in `rankAffinityCandidates`.
			sort: "-publishDate",
			depth: 1,
			// The cards print the review title in the locale the page is
			// rendering. Without it every related review comes back in the
			// default locale and the Indonesian page shows English titles next
			// to Indonesian ones. English fallback comes from the Payload
			// `fallback: true` config, not from extra reads.
			locale,
		});

		affinityDocs = docs;
		candidates = docs.map((doc) =>
			toAffinityCandidate(
				doc,
				genreIds,
				tagIds,
				moodTagIds,
				currentReviewId,
				now,
			),
		);
	}

	// Eligible picks lead in stored order; affinity backfills to 3, never
	// re-adds a pick, and drops everything past the limit.
	const slugs = mergeRelatedReviews(picks, candidates, DEFAULT_RELATED_LIMIT);

	if (slugs.length === 0) {
		return null;
	}

	// Both reads above return card-ready docs, so the winners map back to a
	// doc with no third query (ISR-safe: at most two bounded reads).
	const docsBySlug = new Map<string, Review>();

	for (const doc of [...pickDocs, ...affinityDocs]) {
		if (
			typeof doc.slug === "string" &&
			doc.slug.length > 0 &&
			!docsBySlug.has(doc.slug)
		) {
			docsBySlug.set(doc.slug, doc);
		}
	}

	const ordered = slugs
		.map((slug) => docsBySlug.get(slug))
		.filter((doc): doc is Review => doc !== undefined);

	if (ordered.length === 0) {
		return null;
	}

	return <RelatedReviewsList reviews={ordered} locale={locale} />;
}
