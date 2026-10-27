import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";

import { formatDate } from "@/lib/date-format";
import { getDictionary } from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import { mergeRelatedReviews } from "@/lib/related-scoring";
import type { Genre, Review } from "@/payload-types";
import { renderStatic } from "../../__tests__/helpers/render-static";
import {
	RelatedReviewsList,
	toAffinityCandidate,
	toRelatedPick,
} from "../RelatedReviewsList";

/**
 * Phase 2 coverage for the related-reviews rail (`FR-1`, `FR-2`, `FR-4`,
 * `FR-5`, `FR-6`, `AC-1`, `AC-5`, `AC-7`).
 *
 * The async wrapper (`RelatedReviews`) boots Payload, so like every other
 * data-fetching server component it cannot render through the synchronous
 * `renderStatic` harness. The split is deliberate: this suite renders the
 * sync list, exercises the pick/candidate flag builders, and pins the
 * wrapper's wiring by source — each assertion says which half it covers.
 *
 * Expected copy always comes from `getDictionary`, never from a literal:
 * the suite asserts the rail reads the dictionary, not that it spells a
 * particular language a particular way.
 */

const NOW = new Date("2026-06-01T00:00:00.000Z");

function makeReview(overrides: Partial<Review> & { id: number }): Review {
	return {
		title: "Untitled Review",
		bookAuthor: "A. Writer",
		rating: 4,
		coverImage: {
			id: 900,
			alt: "",
			updatedAt: "2026-01-01T00:00:00.000Z",
			createdAt: "2026-01-01T00:00:00.000Z",
			url: "/api/media/file/cover.jpg",
		},
		author: 1,
		slug: "untitled-review",
		publishDate: "2026-05-01T00:00:00.000Z",
		updatedAt: "2026-05-01T00:00:00.000Z",
		createdAt: "2026-04-01T00:00:00.000Z",
		_status: "published",
		...overrides,
	};
}

function render(reviews: Review[], locale: "en" | "id" = "en"): string {
	return renderStatic(createElement(RelatedReviewsList, { reviews, locale }));
}

describe("RelatedReviewsList", () => {
	test("renders nothing when the rail is empty (AC-1)", () => {
		expect(render([])).toBe("");
	});

	test("renders rows in rail order with locale links (AC-1, AC-5)", () => {
		const first = makeReview({
			id: 2,
			slug: "first-pick",
			title: "First Pick",
		});
		const second = makeReview({
			id: 3,
			slug: "second-pick",
			title: "Second Pick",
		});

		const html = render([first, second]);

		expect(html.indexOf("First Pick")).toBeGreaterThan(-1);
		expect(html.indexOf("Second Pick")).toBeGreaterThan(
			html.indexOf("First Pick"),
		);
		expect(html).toContain('href="/en/reviews/first-pick"');
		expect(html).toContain('href="/en/reviews/second-pick"');
	});

	test("each row shows cover, title, rating, and publish date (AC-5)", () => {
		const dictionary = getDictionary("en");
		const review = makeReview({
			id: 2,
			slug: "covered",
			title: "Covered Review",
			rating: 4,
			publishDate: "2026-05-10T00:00:00.000Z",
		});

		const html = render([review]);

		expect(html).toContain("<img");
		expect(html).toContain('alt="Covered Review"');
		expect(html).toContain("Covered Review");
		expect(html).toContain(
			formatMessage(dictionary.ratingLabel, { rating: 4 }),
		);
		expect(html).toContain(formatDate("2026-05-10T00:00:00.000Z", "en"));
	});

	test("retires the full ReviewCard grid: no card chrome (AC-5)", () => {
		const html = render([makeReview({ id: 2, slug: "row" })]);

		expect(html).not.toContain('data-slot="card"');
	});

	test("keeps heading, description, list semantics, and 44px targets", () => {
		const dictionary = getDictionary("en");
		const html = render([makeReview({ id: 2, slug: "row" })]);

		expect(html).toContain("<h2");
		expect(html).toContain(dictionary.relatedMoreLikeThis);
		expect(html).toContain(dictionary.relatedDescription);
		expect(html).toContain("<ul");
		expect(html).toContain("<li");
		expect(html).toContain("<a ");
		expect(html).toContain("min-h-[44px]");
	});

	test("renders Indonesian heading, links, and dates on the /id page (AC-7)", () => {
		const dictionary = getDictionary("id");
		const review = makeReview({
			id: 2,
			slug: "ulasan",
			title: "Ulasan Terpilih",
			publishDate: "2026-05-10T00:00:00.000Z",
		});

		const html = render([review], "id");

		expect(html).toContain(dictionary.relatedMoreLikeThis);
		expect(html).toContain(dictionary.relatedDescription);
		expect(html).toContain('href="/id/reviews/ulasan"');
		expect(html).toContain(
			formatMessage(dictionary.ratingLabel, { rating: 4 }),
		);
		expect(html).toContain(formatDate("2026-05-10T00:00:00.000Z", "id"));
	});
});

describe("pick and candidate eligibility flags (FR-2, FR-5)", () => {
	test("an eligible pick keeps its slug and flag", () => {
		const pick = toRelatedPick(
			makeReview({ id: 2, slug: "good-pick" }),
			1,
			NOW,
		);

		expect(pick).toEqual({ slug: "good-pick", eligible: true });
	});

	test("a pick of the current review is excluded", () => {
		const pick = toRelatedPick(makeReview({ id: 1, slug: "self" }), 1, NOW);

		expect(pick.eligible).toBe(false);
	});

	test("an unpublished pick is excluded", () => {
		const pick = toRelatedPick(
			makeReview({ id: 2, slug: "draft", _status: "draft" }),
			1,
			NOW,
		);

		expect(pick.eligible).toBe(false);
	});

	test("a scheduled-future pick is excluded, a due one is kept", () => {
		const future = toRelatedPick(
			makeReview({
				id: 2,
				slug: "future",
				publishAt: "2026-07-01T00:00:00.000Z",
			}),
			1,
			NOW,
		);
		const due = toRelatedPick(
			makeReview({ id: 3, slug: "due", publishAt: "2026-05-15T00:00:00.000Z" }),
			1,
			NOW,
		);

		expect(future.eligible).toBe(false);
		expect(due.eligible).toBe(true);
	});

	test("a pick without a slug is excluded: it has no destination", () => {
		const pick = toRelatedPick(makeReview({ id: 2, slug: null }), 1, NOW);

		expect(pick).toEqual({ slug: "", eligible: false });
	});

	test("candidates count overlap across populated and raw taxonomy ids", () => {
		const candidate = toAffinityCandidate(
			makeReview({
				id: 3,
				slug: "overlap",
				genres: [1, { id: 2 } as Genre, 9],
				tags: [3],
				moodTags: [4, 5],
			}),
			[2, 9],
			[7],
			[4, 5],
			1,
			NOW,
		);

		expect(candidate.sharedGenres).toBe(2);
		expect(candidate.sharedTags).toBe(0);
		expect(candidate.sharedMoods).toBe(2);
		expect(candidate.eligible).toBe(true);
	});

	test("candidates exclude self, drafts, and slugless rows", () => {
		expect(
			toAffinityCandidate(
				makeReview({ id: 1, slug: "self" }),
				[],
				[],
				[],
				1,
				NOW,
			).eligible,
		).toBe(false);
		expect(
			toAffinityCandidate(
				makeReview({ id: 2, slug: "draft", _status: "draft" }),
				[],
				[],
				[],
				1,
				NOW,
			).eligible,
		).toBe(false);
		expect(
			toAffinityCandidate(makeReview({ id: 2, slug: null }), [], [], [], 1, NOW)
				.eligible,
		).toBe(false);
	});

	test("flags feed the Phase 1 merge: picks first, affinity backfills", () => {
		const pick = makeReview({ id: 2, slug: "pick", genres: [1] });
		const affinityTop = makeReview({
			id: 3,
			slug: "affinity-top",
			genres: [1, 2],
			publishDate: "2026-05-20T00:00:00.000Z",
		});
		const affinityNext = makeReview({
			id: 4,
			slug: "affinity-next",
			genres: [9],
			publishDate: "2026-05-21T00:00:00.000Z",
		});

		const merged = mergeRelatedReviews(
			[toRelatedPick(pick, 1, NOW)],
			[
				toAffinityCandidate(affinityTop, [1, 2], [], [], 1, NOW),
				toAffinityCandidate(affinityNext, [1, 2], [], [], 1, NOW),
			],
			3,
		);

		expect(merged).toEqual(["pick", "affinity-top", "affinity-next"]);
	});

	test("an ineligible pick is skipped and its slot backfills (FR-2, FR-5)", () => {
		const merged = mergeRelatedReviews(
			[
				toRelatedPick(
					makeReview({ id: 2, slug: "draft-pick", _status: "draft" }),
					1,
					NOW,
				),
				toRelatedPick(makeReview({ id: 3, slug: "good-pick" }), 1, NOW),
			],
			[
				toAffinityCandidate(
					makeReview({ id: 4, slug: "backfill", genres: [1] }),
					[1],
					[],
					[],
					1,
					NOW,
				),
			],
			3,
		);

		expect(merged).toEqual(["good-pick", "backfill"]);
	});

	test("a pick duplicating an affinity candidate renders once, in place", () => {
		const merged = mergeRelatedReviews(
			[toRelatedPick(makeReview({ id: 2, slug: "shared" }), 1, NOW)],
			[
				toAffinityCandidate(
					makeReview({ id: 2, slug: "shared", genres: [1, 2] }),
					[1, 2],
					[],
					[],
					1,
					NOW,
				),
				toAffinityCandidate(
					makeReview({ id: 3, slug: "other", genres: [1] }),
					[1, 2],
					[],
					[],
					1,
					NOW,
				),
			],
			3,
		);

		expect(merged).toEqual(["shared", "other"]);
	});
});

describe("async rail wiring (source-pinned)", () => {
	/**
	 * The wrapper fetches from Payload, so it cannot render in this harness
	 * (see the `renderStatic` boundary note). These pins assert the wiring
	 * the rendered tests above cannot reach: picks in, merge in the middle,
	 * the list module out. Each pin names the behavior it guards so a
	 * refactor updates the test instead of deleting it.
	 */
	const wrapperSource = readFileSync(
		join(process.cwd(), "src/components/reviews/RelatedReviews.tsx"),
		"utf8",
	);
	const pageSource = readFileSync(
		join(process.cwd(), "src/app/(public)/[locale]/reviews/[slug]/page.tsx"),
		"utf8",
	);

	test("the wrapper accepts author picks (P2.T1)", () => {
		expect(wrapperSource).toContain("relatedReviews?:");
	});

	test("the wrapper resolves picks through the eligibility flags (FR-2)", () => {
		expect(wrapperSource).toContain("toRelatedPick");
	});

	test("the wrapper scores one bounded affinity read (FR-3, NFR-1)", () => {
		expect(wrapperSource).toContain("toAffinityCandidate");
		expect(wrapperSource).toContain("limit: AFFINITY_QUERY_LIMIT");
	});

	test("the wrapper merges picks-first with affinity backfill (FR-2)", () => {
		expect(wrapperSource).toContain("mergeRelatedReviews");
	});

	test("the rail stays hidden when nothing is eligible (AC-1)", () => {
		expect(wrapperSource).toContain("return null");
	});

	test("the wrapper renders the compact list, not the card grid (FR-4)", () => {
		expect(wrapperSource).toContain("<RelatedReviewsList");
		expect(wrapperSource).not.toContain("ReviewCard");
	});

	test("the review page passes its author picks into the rail (P2.T1)", () => {
		expect(pageSource).toContain("<RelatedReviews");
		expect(pageSource).toContain("relatedReviews={review.relatedReviews}");
	});
});
