import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertCover } from "../../../e2e/global-setup";
import formatSlug from "../../hooks/formatSlug";
import {
	CI_WORKER_COUNT,
	checkRedisReadiness,
	DEFAULT_E2E_PORT,
	DEFAULT_WORKER_COUNT,
	E2E_FIXTURE_AUTHOR,
	E2E_FIXTURE_COVER,
	E2E_FIXTURE_DRAFT_REVIEW,
	E2E_FIXTURE_DRAFT_REVIEW_PATH,
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_REVIEW_PATH,
	E2E_FIXTURE_REVIEW_SLUG,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_SCHEDULED_REVIEW,
	E2E_FIXTURE_SCHEDULED_REVIEW_PATH,
	E2E_FIXTURE_STALE_REVIEW_LOCALIZED,
	E2E_FIXTURE_TAXONOMY,
	resolveE2EBaseURL,
	resolveE2EDatabaseUri,
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

/**
 * A stand-in for the media collection that behaves the way the fixture needs
 * it to: it keeps the documents in memory and writes every file into the
 * directory the fixture reads it back from.
 */
class FakeMediaCollection {
	docs: Array<{ id: number; alt: string; filename: string | null }> = [];
	created = 0;
	updated = 0;
	staticDir: string;

	constructor(staticDir: string) {
		this.staticDir = staticDir;
	}

	async find(args: { where: { alt: { equals: string } } }) {
		return {
			docs: this.docs.filter((doc) => doc.alt === args.where.alt.equals),
		};
	}

	async create(args: {
		data: { alt: string };
		file: { data: Buffer; name: string };
	}) {
		this.created += 1;
		const doc = {
			id: this.docs.length + 1,
			alt: args.data.alt,
			filename: args.file.name,
		};
		this.docs.push(doc);
		this.writeFile(args.file);
		return doc;
	}

	async update(args: {
		id: number;
		data: { alt: string };
		file: { data: Buffer; name: string };
	}) {
		this.updated += 1;
		const doc = this.docs.find((entry) => entry.id === args.id);
		if (!doc) {
			throw new Error(`No media document with the id ${args.id}.`);
		}
		doc.alt = args.data.alt;
		doc.filename = args.file.name;
		this.writeFile(args.file);
		return doc;
	}

	writeFile(file: { data: Buffer; name: string }) {
		writeFileSync(join(this.staticDir, file.name), file.data);
	}
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

	describe("resolveE2EDatabaseUri", () => {
		it("suffixes the database name of the ambient connection string", () => {
			expect(
				resolveE2EDatabaseUri({
					DATABASE_URI:
						"postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters",
				}),
			).toBe(
				"postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e",
			);
		});

		it("keeps the host, the port and the credentials", () => {
			const resolved = resolveE2EDatabaseUri({
				DATABASE_URI:
					"postgresql://someone:secret@db.internal:6543/chasing-chapters",
			});
			expect(resolved).toBe(
				"postgresql://someone:secret@db.internal:6543/chasing-chapters_e2e",
			);
		});

		it("does not suffix a connection string that already points at an e2e database", () => {
			const e2eUri =
				"postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e";
			expect(resolveE2EDatabaseUri({ DATABASE_URI: e2eUri })).toBe(e2eUri);
		});

		it("keeps the query string", () => {
			expect(
				resolveE2EDatabaseUri({
					DATABASE_URI:
						"postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters?sslmode=require",
				}),
			).toBe(
				"postgresql://postgres:postgrespassword@localhost:5432/chasing-chapters_e2e?sslmode=require",
			);
		});

		it("resolves to undefined without a usable connection string", () => {
			expect(resolveE2EDatabaseUri({})).toBeUndefined();
			expect(resolveE2EDatabaseUri({ DATABASE_URI: "" })).toBeUndefined();
			expect(resolveE2EDatabaseUri({ DATABASE_URI: "   " })).toBeUndefined();
			expect(
				resolveE2EDatabaseUri({ DATABASE_URI: "not-a-connection-string" }),
			).toBeUndefined();
			expect(
				resolveE2EDatabaseUri({
					DATABASE_URI: "postgresql://postgres:postgrespassword@localhost:5432",
				}),
			).toBeUndefined();
		});
	});

	describe("checkRedisReadiness", () => {
		it("reports a clear message when Redis cannot be reached", async () => {
			const result = await checkRedisReadiness(
				{ REDIS_URL: "redis://localhost:6379" },
				async () => {
					throw new Error("connect ECONNREFUSED 127.0.0.1:6379");
				},
			);

			expect(result.ok).toBe(false);
			expect(result.message).toContain("not reachable");
			expect(result.message).toContain("REDIS_URL");
			expect(result.message).toContain("docker compose up redis");
		});

		it("reports a missing REDIS_URL as a missing prerequisite", async () => {
			const result = await checkRedisReadiness({}, async () => {});

			expect(result.ok).toBe(false);
			expect(result.message).toContain("REDIS_URL");
			expect(result.message).toContain("docker compose up redis");
		});

		it("pings the URL the app would use", async () => {
			let pinged = "";
			const result = await checkRedisReadiness(
				{ REDIS_URL: " redis://localhost:6379 " },
				async (url) => {
					pinged = url;
				},
			);

			expect(result.ok).toBe(true);
			expect(pinged).toBe("redis://localhost:6379");
		});
	});

	describe("the fixture's cover", () => {
		it("repairs the document instead of creating a second one", async () => {
			const staticDir = mkdtempSync(join(tmpdir(), "e2e-cover-"));
			const collection = new FakeMediaCollection(staticDir);
			const payload = collection as unknown as Parameters<
				typeof upsertCover
			>[0];

			try {
				const first = await upsertCover(payload, { staticDir });
				expect(collection.docs).toHaveLength(1);
				expect(collection.created).toBe(1);

				// The database survived, the file did not: the next seed has to
				// repair the document instead of creating a second one.
				rmSync(join(staticDir, E2E_FIXTURE_COVER.filename), { force: true });

				const second = await upsertCover(payload, { staticDir });

				expect(collection.docs).toHaveLength(1);
				expect(collection.created).toBe(1);
				expect(collection.updated).toBe(1);
				expect(second).toBe(first);
				expect(existsSync(join(staticDir, E2E_FIXTURE_COVER.filename))).toBe(
					true,
				);
			} finally {
				rmSync(staticDir, { force: true, recursive: true });
			}
		});
	});

	describe("e2e fixture dataset", () => {
		it("keeps the review identifiers stable", () => {
			expect(E2E_FIXTURE_REVIEWS.map((review) => review.slug)).toEqual([
				"e2e-fixture-the-lighthouse-keepers-almanac",
				"e2e-fixture-salt-and-paper-lanterns",
				"e2e-fixture-the-cartographers-error",
				"e2e-fixture-nine-kinds-of-weather",
				"e2e-fixture-the-slow-orbit",
			]);
			expect(E2E_FIXTURE_REVIEWS.map((review) => review.publishDate)).toEqual([
				"2026-04-18T00:00:00.000Z",
				"2026-04-11T00:00:00.000Z",
				"2026-03-28T00:00:00.000Z",
				"2026-03-21T00:00:00.000Z",
				"2026-02-14T00:00:00.000Z",
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

		it("schedules exactly one review into the far future", () => {
			const scheduled = E2E_FIXTURE_REVIEWS.filter(
				(review) => review.publishAt !== undefined,
			);

			expect(scheduled).toHaveLength(1);
			expect(scheduled[0]).toBe(E2E_FIXTURE_SCHEDULED_REVIEW);
			expect(E2E_FIXTURE_SCHEDULED_REVIEW.publishAt).toBe(
				"2030-01-01T00:00:00.000Z",
			);
			expect(E2E_FIXTURE_SCHEDULED_REVIEW_PATH).toBe(
				"/reviews/e2e-fixture-the-slow-orbit",
			);
			// Published, so it is the schedule alone that hides it.
			expect(E2E_FIXTURE_SCHEDULED_REVIEW.translationStatus).toBe("translated");
		});

		it("derives every slug from its title the way the collection does", () => {
			for (const review of E2E_FIXTURE_REVIEWS) {
				expect(review.slug).toBe(deriveSlug(review.title));
			}
			expect(deriveSlug(E2E_FIXTURE_READING_LIST.title)).toBe(
				E2E_FIXTURE_READING_LIST.slug,
			);
			expect(deriveSlug(E2E_FIXTURE_DRAFT_REVIEW.title)).toBe(
				E2E_FIXTURE_DRAFT_REVIEW.slug,
			);
		});

		it("keeps the never-published draft out of the seeded reviews", () => {
			// The draft is its own row on purpose: every spec that walks the
			// seeded reviews expects published documents, and the sitemap spec
			// expects the ones without a schedule to be listed.
			expect(E2E_FIXTURE_REVIEWS).not.toContain(E2E_FIXTURE_DRAFT_REVIEW);
			expect(E2E_FIXTURE_DRAFT_REVIEW_PATH).toBe(
				"/reviews/e2e-fixture-the-unwritten-letter",
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

		it("gives every translated review an Indonesian payload", () => {
			const translated = E2E_FIXTURE_REVIEWS.filter(
				(review) => review.translationStatus === "translated",
			);
			expect(translated.length).toBeGreaterThan(0);

			for (const review of translated) {
				expect(review.id).toBeDefined();
				expect(review.id?.reviewContent).toBeDefined();
				expect(review.id?.whatILoved).toBeDefined();
				expect(review.id?.whatCouldBeBetter).toBeDefined();
				expect(review.id?.perfectFor).toBeDefined();
			}
		});

		it("gives exactly one review an Indonesian title with an English body", () => {
			const titled = E2E_FIXTURE_REVIEWS.filter(
				(review) => review.localizedTitle,
			);

			expect(titled).toHaveLength(1);
			expect(titled[0].translationStatus).toBe("stale");
			// No Indonesian body: the title is the only translated value, which
			// is what proves the two are localized independently (FR-10).
			expect(titled[0].id).toBeUndefined();
			expect(titled[0].localizedTitle).toBe(
				E2E_FIXTURE_STALE_REVIEW_LOCALIZED.title,
			);
			expect(titled[0].localizedTitle).not.toBe(titled[0].title);
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
