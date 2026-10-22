import { describe, expect, it } from "bun:test";
import formatSlug from "../../hooks/formatSlug";
import {
	CI_WORKER_COUNT,
	DEFAULT_E2E_PORT,
	DEFAULT_WORKER_COUNT,
	E2E_FIXTURE_AUTHOR,
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_REVIEW_PATH,
	E2E_FIXTURE_REVIEW_SLUG,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_TAXONOMY,
	resolveE2EBaseURL,
	resolveE2EPort,
	resolveWorkerCount,
} from "../e2e-harness";

/**
 * The slug the collection derives from a title, using the collection's own
 * hook so the fixture cannot drift away from it.
 */
function deriveSlug(title: string): string {
	const hook = formatSlug("title") as unknown as (args: {
		value?: string;
		originalDoc?: Record<string, unknown>;
		data?: Record<string, unknown>;
	}) => string | undefined;
	return (
		hook({ value: undefined, originalDoc: undefined, data: { title } }) ?? ""
	);
}

describe("e2e-harness", () => {
	describe("resolveWorkerCount", () => {
		it("defaults to three workers on a developer machine", () => {
			expect(resolveWorkerCount({})).toBe(3);
			expect(resolveWorkerCount({})).toBe(DEFAULT_WORKER_COUNT);
		});

		it("runs with a single worker in CI", () => {
			expect(resolveWorkerCount({ CI: "true" })).toBe(1);
			expect(resolveWorkerCount({ CI: "1" })).toBe(CI_WORKER_COUNT);
		});

		it("honours the PLAYWRIGHT_WORKERS override", () => {
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "5" })).toBe(5);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "1" })).toBe(1);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: " 8 " })).toBe(8);
		});

		it("keeps the CI single-worker cap even when an override is set", () => {
			expect(resolveWorkerCount({ CI: "true", PLAYWRIGHT_WORKERS: "5" })).toBe(
				CI_WORKER_COUNT,
			);
		});

		it("falls back to the default for a malformed override", () => {
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "many" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "0" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "-2" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "2.5" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
			expect(resolveWorkerCount({ PLAYWRIGHT_WORKERS: "" })).toBe(
				DEFAULT_WORKER_COUNT,
			);
		});

		it("treats an explicitly disabled CI as a developer machine", () => {
			expect(resolveWorkerCount({ CI: "false" })).toBe(DEFAULT_WORKER_COUNT);
			expect(resolveWorkerCount({ CI: "0" })).toBe(DEFAULT_WORKER_COUNT);
			expect(resolveWorkerCount({ CI: "false", PLAYWRIGHT_WORKERS: "5" })).toBe(
				5,
			);
		});
	});

	describe("resolveE2EPort", () => {
		it("defaults to the dedicated e2e port", () => {
			expect(resolveE2EPort({})).toBe(3100);
			expect(resolveE2EPort({})).toBe(DEFAULT_E2E_PORT);
		});

		it("honours the E2E_PORT override", () => {
			expect(resolveE2EPort({ E2E_PORT: "3200" })).toBe(3200);
		});

		it("falls back to the default for a malformed or out-of-range value", () => {
			expect(resolveE2EPort({ E2E_PORT: "abc" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "0" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "70000" })).toBe(DEFAULT_E2E_PORT);
			expect(resolveE2EPort({ E2E_PORT: "" })).toBe(DEFAULT_E2E_PORT);
		});
	});

	describe("resolveE2EBaseURL", () => {
		it("matches the resolved port", () => {
			expect(resolveE2EBaseURL({})).toBe("http://localhost:3100");
			expect(resolveE2EBaseURL({ E2E_PORT: "3200" })).toBe(
				"http://localhost:3200",
			);
		});
	});

	describe("e2e fixture dataset", () => {
		it("keeps the review identifiers stable", () => {
			expect(E2E_FIXTURE_REVIEWS.map((review) => review.slug)).toEqual([
				"e2e-fixture-the-lighthouse-keepers-almanac",
				"e2e-fixture-salt-and-paper-lanterns",
				"e2e-fixture-the-cartographers-error",
				"e2e-fixture-nine-kinds-of-weather",
			]);
			expect(E2E_FIXTURE_REVIEWS.map((review) => review.publishDate)).toEqual([
				"2026-04-18T00:00:00.000Z",
				"2026-04-11T00:00:00.000Z",
				"2026-03-28T00:00:00.000Z",
				"2026-03-21T00:00:00.000Z",
			]);
			expect(E2E_FIXTURE_REVIEW_SLUG).toBe(
				"e2e-fixture-the-lighthouse-keepers-almanac",
			);
			expect(E2E_FIXTURE_REVIEW_PATH).toBe(
				"/reviews/e2e-fixture-the-lighthouse-keepers-almanac",
			);
			expect(E2E_FIXTURE_READING_LIST.slug).toBe(
				"e2e-fixture-rainy-season-reading-list",
			);
			expect(E2E_FIXTURE_AUTHOR.email).toBe("e2e-admin@example.test");
		});

		it("derives every slug from its title the way the collection does", () => {
			for (const review of E2E_FIXTURE_REVIEWS) {
				expect(review.slug).toBe(deriveSlug(review.title));
			}
			expect(deriveSlug(E2E_FIXTURE_READING_LIST.title)).toBe(
				E2E_FIXTURE_READING_LIST.slug,
			);
		});

		it("uses unique identifiers throughout", () => {
			const slugs = E2E_FIXTURE_REVIEWS.map((review) => review.slug);
			expect(new Set(slugs).size).toBe(slugs.length);
			const titles = E2E_FIXTURE_REVIEWS.map((review) => review.title);
			expect(new Set(titles).size).toBe(titles.length);
		});

		it("seeds the three translation states the admin surfaces read", () => {
			const statuses = new Set(
				E2E_FIXTURE_REVIEWS.map((review) => review.translationStatus),
			);
			expect(statuses).toEqual(new Set(["translated", "failed", "stale"]));

			const failed = E2E_FIXTURE_REVIEWS.find(
				(review) => review.translationStatus === "failed",
			);
			expect(failed?.translationError).toBeTruthy();

			const translated = E2E_FIXTURE_REVIEWS.find(
				(review) => review.translationStatus === "translated",
			);
			expect(translated?.translationUpdatedAt).toBeTruthy();
		});

		it("seeds at least two featured reviews so the carousel renders", () => {
			const featured = E2E_FIXTURE_REVIEWS.filter((review) => review.featured);
			expect(featured.length).toBeGreaterThanOrEqual(2);
		});

		it("references only taxonomy the fixture seeds", () => {
			const genres = new Set<string>(E2E_FIXTURE_TAXONOMY.genres);
			const tags = new Set<string>(E2E_FIXTURE_TAXONOMY.tags);
			const moodTags = new Set<string>(E2E_FIXTURE_TAXONOMY.moodTags);

			for (const review of E2E_FIXTURE_REVIEWS) {
				for (const genre of review.genres) {
					expect(genres.has(genre)).toBe(true);
				}
				for (const tag of review.tags) {
					expect(tags.has(tag)).toBe(true);
				}
				for (const moodTag of review.moodTags) {
					expect(moodTags.has(moodTag)).toBe(true);
				}
			}
		});

		it("keeps every content-bearing value free of the clock", () => {
			for (const review of E2E_FIXTURE_REVIEWS) {
				expect(review.publishDate).toMatch(
					/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
				);
				if (review.translationUpdatedAt) {
					expect(review.translationUpdatedAt).toMatch(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
					);
				}
			}
		});
	});
});
