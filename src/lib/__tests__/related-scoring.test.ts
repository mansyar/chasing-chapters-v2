import { describe, expect, it } from "bun:test";
import {
	type AffinityCandidate,
	DEFAULT_RELATED_LIMIT,
	mergeRelatedReviews,
	RELATED_GENRE_WEIGHT,
	RELATED_MOOD_WEIGHT,
	RELATED_TAG_WEIGHT,
	type RelatedPick,
	rankAffinityCandidates,
	scoreAffinityOverlap,
} from "../related-scoring";

function candidate(
	overrides: Partial<AffinityCandidate> & { slug: string },
): AffinityCandidate {
	return {
		sharedGenres: 0,
		sharedTags: 0,
		sharedMoods: 0,
		eligible: true,
		publishDate: null,
		...overrides,
	};
}

function pick(slug: string, eligible = true): RelatedPick {
	return { slug, eligible };
}

describe("related-scoring", () => {
	describe("scoreAffinityOverlap", () => {
		it("weights one shared genre as 3, one shared tag as 2, one shared mood as 1", () => {
			expect(RELATED_GENRE_WEIGHT).toBe(3);
			expect(RELATED_TAG_WEIGHT).toBe(2);
			expect(RELATED_MOOD_WEIGHT).toBe(1);
			expect(
				scoreAffinityOverlap({
					sharedGenres: 1,
					sharedTags: 1,
					sharedMoods: 1,
				}),
			).toBe(6);
		});

		it("returns zero when nothing overlaps", () => {
			expect(
				scoreAffinityOverlap({
					sharedGenres: 0,
					sharedTags: 0,
					sharedMoods: 0,
				}),
			).toBe(0);
		});

		it("scales each weight by its overlap count", () => {
			// 2 genres * 3 + 3 tags * 2 + 4 moods * 1 = 16.
			expect(
				scoreAffinityOverlap({
					sharedGenres: 2,
					sharedTags: 3,
					sharedMoods: 4,
				}),
			).toBe(16);
		});
	});

	describe("rankAffinityCandidates", () => {
		it("orders genre overlap above tag overlap above mood overlap", () => {
			// AC-3: identical dates so only the weight decides the order.
			const ranked = rankAffinityCandidates([
				candidate({
					slug: "mood",
					sharedMoods: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
				candidate({
					slug: "tag",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
				candidate({
					slug: "genre",
					sharedGenres: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
			]);

			expect(ranked.map((entry) => entry.slug)).toEqual([
				"genre",
				"tag",
				"mood",
			]);
			expect(ranked.map((entry) => entry.score)).toEqual([3, 2, 1]);
		});

		it("lets a higher total outrank a single high-weight overlap", () => {
			const ranked = rankAffinityCandidates([
				candidate({ slug: "one-genre", sharedGenres: 1 }),
				candidate({ slug: "two-tags", sharedTags: 2 }),
			]);

			expect(ranked.map((entry) => entry.slug)).toEqual([
				"two-tags",
				"one-genre",
			]);
		});

		it("breaks score ties by newest publishDate first", () => {
			// AC-4: same score, so recency decides.
			const ranked = rankAffinityCandidates([
				candidate({
					slug: "older",
					sharedTags: 1,
					publishDate: "2026-04-01T00:00:00.000Z",
				}),
				candidate({
					slug: "newer",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
			]);

			expect(ranked.map((entry) => entry.slug)).toEqual(["newer", "older"]);
		});

		it("breaks date ties by slug ascending", () => {
			// AC-4: same score and same date, so slug decides deterministically.
			const ranked = rankAffinityCandidates([
				candidate({
					slug: "c-slug",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
				candidate({
					slug: "a-slug",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
				candidate({
					slug: "b-slug",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
			]);

			expect(ranked.map((entry) => entry.slug)).toEqual([
				"a-slug",
				"b-slug",
				"c-slug",
			]);
		});

		it("sorts candidates without a usable publishDate last on ties", () => {
			const ranked = rankAffinityCandidates([
				candidate({ slug: "no-date", sharedTags: 1, publishDate: null }),
				candidate({
					slug: "bad-date",
					sharedTags: 1,
					publishDate: "not-a-timestamp",
				}),
				candidate({
					slug: "dated",
					sharedTags: 1,
					publishDate: "2026-05-01T00:00:00.000Z",
				}),
			]);

			// Dated first; the two undated tie on -Infinity, so slug decides.
			expect(ranked.map((entry) => entry.slug)).toEqual([
				"dated",
				"bad-date",
				"no-date",
			]);
		});

		it("excludes ineligible candidates", () => {
			const ranked = rankAffinityCandidates([
				candidate({ slug: "hidden", sharedGenres: 5, eligible: false }),
				candidate({ slug: "visible", sharedMoods: 1 }),
			]);

			expect(ranked.map((entry) => entry.slug)).toEqual(["visible"]);
		});

		it("returns an empty list for empty input", () => {
			expect(rankAffinityCandidates([])).toEqual([]);
		});
	});

	describe("mergeRelatedReviews", () => {
		it("leads with eligible picks in stored order, then backfills with affinity", () => {
			// AC-2: the authored pick renders first, in stored order.
			const merged = mergeRelatedReviews(
				[pick("pick-first"), pick("pick-second")],
				[
					candidate({ slug: "affinity-top", sharedGenres: 2 }),
					candidate({ slug: "affinity-next", sharedGenres: 1 }),
				],
			);

			expect(merged).toEqual(["pick-first", "pick-second", "affinity-top"]);
		});

		it("defaults to three slots", () => {
			expect(DEFAULT_RELATED_LIMIT).toBe(3);
			const merged = mergeRelatedReviews(
				[],
				[
					candidate({ slug: "one", sharedGenres: 3 }),
					candidate({ slug: "two", sharedGenres: 2 }),
					candidate({ slug: "three", sharedGenres: 1 }),
					candidate({ slug: "four", sharedTags: 1 }),
				],
			);

			expect(merged).toEqual(["one", "two", "three"]);
		});

		it("honours a custom limit", () => {
			const merged = mergeRelatedReviews(
				[pick("pick-first")],
				[
					candidate({ slug: "one", sharedGenres: 1 }),
					candidate({ slug: "two", sharedTags: 1 }),
				],
				2,
			);

			expect(merged).toEqual(["pick-first", "one"]);
		});

		it("skips ineligible picks and backfills their slots", () => {
			// AC-6: an unpublished (or scheduled-future, or self) pick never
			// renders; affinity fills the freed slot.
			const merged = mergeRelatedReviews(
				[pick("unpublished-pick", false), pick("good-pick")],
				[candidate({ slug: "affinity-top", sharedGenres: 1 })],
			);

			expect(merged).toEqual(["good-pick", "affinity-top"]);
		});

		it("shows a pick that duplicates an affinity candidate once, in pick position", () => {
			// AC-6: no duplicates; the pick position wins.
			const merged = mergeRelatedReviews(
				[pick("shared")],
				[
					candidate({ slug: "shared", sharedGenres: 5 }),
					candidate({ slug: "affinity-next", sharedGenres: 1 }),
					candidate({ slug: "affinity-last", sharedTags: 1 }),
				],
			);

			expect(merged).toEqual(["shared", "affinity-next", "affinity-last"]);
		});

		it("drops picks beyond the limit and ignores affinity", () => {
			const merged = mergeRelatedReviews(
				[pick("one"), pick("two"), pick("three"), pick("four")],
				[candidate({ slug: "affinity-top", sharedGenres: 9 })],
			);

			expect(merged).toEqual(["one", "two", "three"]);
		});

		it("never consults affinity once picks fill every slot", () => {
			const merged = mergeRelatedReviews(
				[pick("one"), pick("two"), pick("three")],
				[candidate({ slug: "affinity-top", sharedGenres: 9 })],
			);

			expect(merged).toEqual(["one", "two", "three"]);
		});

		it("dedupes repeated picks, keeping the first stored position", () => {
			const merged = mergeRelatedReviews(
				[pick("same"), pick("same"), pick("other")],
				[candidate({ slug: "affinity-top", sharedGenres: 1 })],
			);

			expect(merged).toEqual(["same", "other", "affinity-top"]);
		});

		it("returns an empty list when nothing is eligible", () => {
			expect(
				mergeRelatedReviews(
					[pick("draft", false)],
					[candidate({ slug: "hidden", sharedGenres: 2, eligible: false })],
				),
			).toEqual([]);
			expect(mergeRelatedReviews([], [])).toEqual([]);
		});

		it("returns an empty list for a zero limit", () => {
			expect(
				mergeRelatedReviews(
					[pick("one")],
					[candidate({ slug: "two", sharedGenres: 1 })],
					0,
				),
			).toEqual([]);
		});
	});
});
