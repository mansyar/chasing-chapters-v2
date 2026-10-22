import { spawnSync } from "node:child_process";
import "dotenv/config";
import type { getPayload } from "payload";
import {
	E2E_FIXTURE_AUTHOR,
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_TAXONOMY,
	type E2EFixtureReview,
} from "../src/lib/e2e-harness";
import {
	canTransition,
	TRANSLATION_STATUSES,
	type TranslationStatus,
} from "../src/lib/translation-status";

/**
 * Seeds the deterministic e2e dataset.
 *
 * The fixture is an upsert: every row is matched on a fixed identifier (the
 * author by email, reviews and the reading list by slug, the cover by its
 * alt text), so running the fixture twice leaves the same rows with the same
 * identifiers. Rows the fixture does not own are never touched, and nothing
 * is ever deleted.
 *
 * Every write runs with `skipTranslation`, so the reviews keep the
 * translation status the dataset asks for instead of being handed to the
 * real translation provider.
 */

/** Keeps the translation pipeline out of the fixture writes. */
const FIXTURE_CONTEXT = { skipTranslation: true } as const;

type PayloadClient = Awaited<ReturnType<typeof getPayload>>;

type TaxonomyItem = { id: number };

type SeedSummary = {
	author: { id: number; email: string };
	reviews: Array<{ id: number; slug: string }>;
	readingList: { id: number; slug: string };
};

/**
 * The postgres adapter uses integer ids, but Payload types them as
 * `string | number`.
 */
function toId(value: string | number): number {
	return Number(value);
}

/**
 * The Payload client is reused for the lifetime of the process, so the
 * fixture can be seeded more than once (the upsert has to be idempotent).
 */
let payloadClient: PayloadClient | null = null;

async function getPayloadClient(): Promise<PayloadClient> {
	if (!payloadClient) {
		// The Payload config is imported lazily: the config pulls in the Next.js
		// server code (through the collection hooks), which only resolves under
		// the bundler or Bun - not inside Playwright's Node loader.
		const [{ default: config }, { getPayload: createPayload }] =
			await Promise.all([import("@payload-config"), import("payload")]);
		payloadClient = await createPayload({ config });
	}
	return payloadClient;
}

/**
 * Releases the database connection, so a one-shot seed does not keep the
 * process alive.
 */
export async function disposeE2EDataset(): Promise<void> {
	const client = payloadClient;
	if (!client) {
		return;
	}
	payloadClient = null;
	await client.db.destroy?.();
}

/**
 * Finds a legal path of translation statuses from `from` to `to`.
 *
 * The collection rejects illegal status transitions, so a review that was
 * left in another state is walked back to the state the dataset asks for
 * instead of failing the seed.
 */
function statusPath(
	from: TranslationStatus,
	to: TranslationStatus,
): TranslationStatus[] {
	if (from === to) {
		return [];
	}

	const queue: Array<{ status: TranslationStatus; path: TranslationStatus[] }> =
		[{ status: from, path: [] }];
	const seen = new Set<TranslationStatus>([from]);

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			break;
		}
		for (const next of TRANSLATION_STATUSES) {
			if (seen.has(next) || !canTransition(current.status, next)) {
				continue;
			}
			const path = [...current.path, next];
			if (next === to) {
				return path;
			}
			seen.add(next);
			queue.push({ status: next, path });
		}
	}

	return [];
}

/**
 * Finds a single document by a field value, or creates it.
 */
async function upsertByName(
	payload: PayloadClient,
	collection: "genres" | "tags" | "mood-tags",
	name: string,
): Promise<TaxonomyItem> {
	const existing = await payload.find({
		collection,
		where: { name: { equals: name } },
		limit: 1,
		depth: 0,
	});

	const found = existing.docs[0];
	if (found) {
		return { id: toId(found.id) };
	}

	const created = await payload.create({
		collection,
		data: { name },
		context: FIXTURE_CONTEXT,
	});
	return { id: toId(created.id) };
}

/**
 * Creates (or refreshes) the fixture account.
 *
 * The credential is a throwaway test-only value: the account only exists in
 * a test database and is not a real user.
 */
async function upsertAuthor(
	payload: PayloadClient,
): Promise<{ id: number; email: string }> {
	const existing = await payload.find({
		collection: "authors",
		where: { email: { equals: E2E_FIXTURE_AUTHOR.email } },
		limit: 1,
		depth: 0,
	});

	const found = existing.docs[0];
	if (found) {
		const updated = await payload.update({
			collection: "authors",
			id: found.id,
			data: {
				name: E2E_FIXTURE_AUTHOR.name,
				role: E2E_FIXTURE_AUTHOR.role,
				password: E2E_FIXTURE_AUTHOR.password,
			},
			context: FIXTURE_CONTEXT,
		});
		return { id: toId(updated.id), email: updated.email };
	}

	const created = await payload.create({
		collection: "authors",
		data: {
			name: E2E_FIXTURE_AUTHOR.name,
			email: E2E_FIXTURE_AUTHOR.email,
			password: E2E_FIXTURE_AUTHOR.password,
			role: E2E_FIXTURE_AUTHOR.role,
		},
		context: FIXTURE_CONTEXT,
	});
	return { id: toId(created.id), email: created.email };
}

/**
 * Resolves the taxonomy the fixture reviews reference, creating the missing
 * ones. Existing rows are reused as they are - the fixture does not rewrite
 * rows it does not own.
 */
async function upsertTaxonomy(payload: PayloadClient): Promise<{
	genres: TaxonomyItem[];
	tags: TaxonomyItem[];
	moodTags: TaxonomyItem[];
}> {
	const genres: TaxonomyItem[] = [];
	for (const name of E2E_FIXTURE_TAXONOMY.genres) {
		genres.push(await upsertByName(payload, "genres", name));
	}

	const tags: TaxonomyItem[] = [];
	for (const name of E2E_FIXTURE_TAXONOMY.tags) {
		tags.push(await upsertByName(payload, "tags", name));
	}

	const moodTags: TaxonomyItem[] = [];
	for (const name of E2E_FIXTURE_TAXONOMY.moodTags) {
		moodTags.push(await upsertByName(payload, "mood-tags", name));
	}

	return { genres, tags, moodTags };
}

/**
 * Walks a review back to the translation status the dataset asks for when
 * the stored status cannot transition to it directly.
 */
async function alignTranslationStatus(
	payload: PayloadClient,
	reviewId: number,
	storedStatus: string,
	desiredStatus: string,
): Promise<void> {
	if (storedStatus === desiredStatus) {
		return;
	}

	const path = statusPath(
		storedStatus as TranslationStatus,
		desiredStatus as TranslationStatus,
	);
	if (path.length === 0) {
		return;
	}

	for (const step of path) {
		await payload.update({
			collection: "reviews",
			id: reviewId,
			data: { translationStatus: step },
			context: FIXTURE_CONTEXT,
		});
	}
}

/**
 * Creates (or refreshes) one review.
 */
async function upsertReview(
	payload: PayloadClient,
	review: E2EFixtureReview,
	ids: {
		authorId: number;
		genreIds: number[];
		tagIds: number[];
		moodTagIds: number[];
	},
): Promise<{ id: number; slug: string }> {
	const existing = await payload.find({
		collection: "reviews",
		where: { slug: { equals: review.slug } },
		limit: 1,
		depth: 0,
	});

	const data = {
		title: review.title,
		slug: review.slug,
		bookAuthor: review.bookAuthor,
		rating: review.rating,
		// The fixture reviews carry no cover image: the public pages fall back
		// to the coverless layout, and the fixture writes no object storage.
		coverImage: null,
		reviewContent: review.reviewContent,
		whatILoved: review.whatILoved,
		whatCouldBeBetter: review.whatCouldBeBetter,
		perfectFor: review.perfectFor,
		favoriteQuotes: review.favoriteQuotes,
		publishDate: review.publishDate,
		featured: review.featured,
		// The fixture never calls the real translation provider.
		autoTranslate: false,
		translationStatus: review.translationStatus,
		...(review.translationUpdatedAt
			? { translationUpdatedAt: review.translationUpdatedAt }
			: {}),
		...(review.translationError
			? { translationError: review.translationError }
			: {}),
		author: ids.authorId,
		genres: ids.genreIds,
		tags: ids.tagIds,
		moodTags: ids.moodTagIds,
		_status: "published" as const,
	};

	const found = existing.docs[0];
	if (!found) {
		const created = await payload.create({
			collection: "reviews",
			data,
			context: FIXTURE_CONTEXT,
		});
		return { id: toId(created.id), slug: created.slug ?? review.slug };
	}

	await alignTranslationStatus(
		payload,
		toId(found.id),
		found.translationStatus ?? "untranslated",
		review.translationStatus,
	);

	const updated = await payload.update({
		collection: "reviews",
		id: found.id,
		data,
		context: FIXTURE_CONTEXT,
	});
	return { id: toId(updated.id), slug: updated.slug ?? review.slug };
}

/**
 * Creates (or refreshes) the fixture reading list.
 */
async function upsertReadingList(
	payload: PayloadClient,
	ids: {
		authorId: number;
		authorEmail: string;
		reviewIds: number[];
	},
): Promise<{ id: number; slug: string }> {
	const existing = await payload.find({
		collection: "reading-lists",
		where: { slug: { equals: E2E_FIXTURE_READING_LIST.slug } },
		limit: 1,
		depth: 0,
	});

	const data = {
		title: E2E_FIXTURE_READING_LIST.title,
		slug: E2E_FIXTURE_READING_LIST.slug,
		description: E2E_FIXTURE_READING_LIST.description,
		featured: E2E_FIXTURE_READING_LIST.featured,
		author: ids.authorId,
		reviews: ids.reviewIds,
		_status: "published" as const,
	};

	// The reading list's author field only accepts the signed-in author or an
	// admin, so the fixture writes as its own admin account.
	const user = {
		id: ids.authorId,
		email: ids.authorEmail,
		role: E2E_FIXTURE_AUTHOR.role,
		collection: "authors",
	};

	const found = existing.docs[0];
	if (!found) {
		const created = await payload.create({
			collection: "reading-lists",
			data,
			user,
			context: FIXTURE_CONTEXT,
		});
		return {
			id: toId(created.id),
			slug: created.slug ?? E2E_FIXTURE_READING_LIST.slug,
		};
	}

	const updated = await payload.update({
		collection: "reading-lists",
		id: found.id,
		data,
		user,
		context: FIXTURE_CONTEXT,
	});
	return {
		id: toId(updated.id),
		slug: updated.slug ?? E2E_FIXTURE_READING_LIST.slug,
	};
}

/**
 * Seeds the whole fixture dataset and reports what it found.
 */
export async function seedE2EDataset(): Promise<SeedSummary> {
	const payload = await getPayloadClient();

	const author = await upsertAuthor(payload);
	const taxonomy = await upsertTaxonomy(payload);

	const reviews: Array<{ id: number; slug: string }> = [];
	for (const review of E2E_FIXTURE_REVIEWS) {
		reviews.push(
			await upsertReview(payload, review, {
				authorId: author.id,
				genreIds: taxonomy.genres.map((genre) => genre.id),
				tagIds: taxonomy.tags.map((tag) => tag.id),
				moodTagIds: taxonomy.moodTags.map((moodTag) => moodTag.id),
			}),
		);
	}

	const readingList = await upsertReadingList(payload, {
		authorId: author.id,
		authorEmail: author.email,
		reviewIds: reviews.map((review) => review.id),
	});

	return { author, reviews, readingList };
}

/**
 * Runs the seed in a child `bun` process.
 *
 * Playwright loads the global setup with its own Node loader, which cannot
 * resolve the Next.js imports the Payload config pulls in. The seed itself
 * therefore runs in a child process, and the package script stays the single
 * place that knows how to reach the Payload local API.
 */
function seedInChildProcess(): void {
	const result = spawnSync("bun run seed:e2e", {
		cwd: process.cwd(),
		stdio: "inherit",
		shell: true,
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			`The e2e fixture seed failed with exit code ${result.status}.`,
		);
	}
}

/**
 * Playwright global setup: seeds the dataset before the suite runs, so a
 * bare `playwright test` also starts from the known fixture.
 */
export default async function globalSetup(): Promise<void> {
	seedInChildProcess();
}
