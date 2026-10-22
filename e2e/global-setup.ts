import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import type { getPayload } from "payload";
import sharp from "sharp";
import {
	E2E_FIXTURE_AUTHOR,
	E2E_FIXTURE_COVER,
	E2E_FIXTURE_MOOD_TAG_DETAILS,
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_TAXONOMY,
	E2E_STORAGE_ADAPTER,
	type E2EFixtureReview,
	resolveE2EDatabaseUri,
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
 * author by email, reviews and the reading list by slug, the cover by its alt
 * text), so running the fixture twice leaves the same rows with the same
 * identifiers. Rows the fixture does not own are never touched, and nothing
 * is ever deleted.
 *
 * Every write runs with `skipTranslation`, so the reviews keep the
 * translation status the dataset asks for instead of being handed to the
 * real translation provider.
 *
 * The fixture writes into the e2e database - never into the database the
 * developer works in - and stores its media on the local disk instead of in
 * object storage.
 */

/** Keeps the translation pipeline out of the fixture writes. */
const FIXTURE_CONTEXT = { skipTranslation: true } as const;

/**
 * The directory Payload's own disk storage writes the media into. The
 * collection resolves it against the working directory, which is the project
 * root for the seed and for the server.
 */
const MEDIA_STATIC_DIR = "media";

/**
 * The color a mood tag gets when the fixture has to create one and the
 * fixture data does not name a color for it.
 */
const DEFAULT_MOOD_TAG_COLOR = "#4C7A9E";

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
		// The fixture never writes into the database the developer works in:
		// the e2e database is derived from the ambient connection string and
		// carries its own suffix.
		const e2eUri = resolveE2EDatabaseUri(process.env);
		if (!e2eUri) {
			throw new Error(
				"DATABASE_URI is missing or unusable, so the e2e database cannot be resolved.",
			);
		}
		process.env.DATABASE_URI = e2eUri;

		// The fixture stores its media on the local disk, so the run needs no
		// object storage and writes nothing into the bucket.
		process.env.STORAGE_ADAPTER = E2E_STORAGE_ADAPTER;

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
 *
 * The details are only used when the row has to be created: a mood tag needs
 * a color, and the rows that already exist are reused as they are.
 */
async function upsertByName(
	payload: PayloadClient,
	collection: "genres" | "tags" | "mood-tags",
	name: string,
	details: { color?: string; icon?: string } = {},
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
		data: { name, ...details },
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
		const details = E2E_FIXTURE_MOOD_TAG_DETAILS[name];
		moodTags.push(
			await upsertByName(payload, "mood-tags", name, {
				color: details?.color ?? DEFAULT_MOOD_TAG_COLOR,
				icon: details?.icon,
			}),
		);
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
 * Draws the cover the fixture attaches to its reviews.
 *
 * The cover is a real image: the review pages render the cover-first layout,
 * and a review without a cover would render an empty frame.
 */
async function drawFixtureCover(): Promise<Buffer> {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
		<rect width="600" height="900" fill="#182a44" />
		<rect x="80" y="120" width="440" height="8" fill="#e8c07d" />
		<rect x="80" y="772" width="300" height="8" fill="#e8c07d" />
		<circle cx="300" cy="450" r="150" fill="#2f4a73" />
		<circle cx="300" cy="450" r="96" fill="#e8c07d" />
		<circle cx="300" cy="450" r="44" fill="#182a44" />
	</svg>`;

	return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Creates (or reuses) the cover the fixture reviews carry.
 *
 * The media document is matched on its alt text. The file on the disk is
 * checked as well: a database that survived a fresh checkout has the
 * document but not the file, and a cover that points at a missing file would
 * render as a broken image.
 *
 * A missing file is repaired: the document that is already there is updated
 * with the file instead of a second document being created. The media row
 * count and the id stay the same across runs, which is what the fixture's
 * idempotent upsert promises - a second document would orphan the first one.
 */
export async function upsertCover(
	payload: PayloadClient,
	options: { staticDir?: string } = {},
): Promise<number> {
	const existing = await payload.find({
		collection: "media",
		where: { alt: { equals: E2E_FIXTURE_COVER.alt } },
		limit: 1,
		depth: 0,
	});

	const staticDir = options.staticDir ?? join(process.cwd(), MEDIA_STATIC_DIR);

	const found = existing.docs[0];
	if (found) {
		const filename = typeof found.filename === "string" ? found.filename : "";
		const onDisk = filename ? existsSync(join(staticDir, filename)) : false;

		if (onDisk) {
			return toId(found.id);
		}

		const data = await drawFixtureCover();
		const updated = await payload.update({
			collection: "media",
			id: found.id,
			data: { alt: E2E_FIXTURE_COVER.alt },
			file: {
				data,
				mimetype: E2E_FIXTURE_COVER.mimeType,
				name: E2E_FIXTURE_COVER.filename,
				size: data.length,
			},
			context: FIXTURE_CONTEXT,
		});

		return toId(updated.id);
	}

	const data = await drawFixtureCover();
	const created = await payload.create({
		collection: "media",
		data: { alt: E2E_FIXTURE_COVER.alt },
		file: {
			data,
			mimetype: E2E_FIXTURE_COVER.mimeType,
			name: E2E_FIXTURE_COVER.filename,
			size: data.length,
		},
		context: FIXTURE_CONTEXT,
	});

	return toId(created.id);
}

/**
 * Creates (or refreshes) one review.
 */
async function upsertReview(
	payload: PayloadClient,
	review: E2EFixtureReview,
	ids: {
		authorId: number;
		coverId: number;
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
		// Every review carries a cover: the cover is a required field, and the
		// public pages render the cover-first layout.
		coverImage: ids.coverId,
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
	let reviewId: number;

	if (!found) {
		const created = await payload.create({
			collection: "reviews",
			data,
			context: FIXTURE_CONTEXT,
		});
		reviewId = toId(created.id);
	} else {
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
		reviewId = toId(updated.id);
	}

	await writeIndonesianContent(payload, reviewId, review);

	return { id: reviewId, slug: review.slug };
}

/**
 * Writes the Indonesian content of a review.
 *
 * The write names the `id` locale, the same way the translation pipeline
 * writes it. A review whose translation status is not `translated` keeps its
 * Indonesian content empty on purpose - that is the state a failed or stale
 * translation leaves behind.
 */
async function writeIndonesianContent(
	payload: PayloadClient,
	reviewId: number,
	review: E2EFixtureReview,
): Promise<void> {
	if (review.translationStatus !== "translated" || !review.id) {
		return;
	}

	await payload.update({
		collection: "reviews",
		id: reviewId,
		locale: "id",
		data: {
			reviewContent: review.id.reviewContent,
			whatILoved: review.id.whatILoved,
			whatCouldBeBetter: review.id.whatCouldBeBetter,
			perfectFor: review.id.perfectFor,
			favoriteQuotes: review.id.favoriteQuotes,
		},
		context: FIXTURE_CONTEXT,
	});
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
	const coverId = await upsertCover(payload);

	const reviews: Array<{ id: number; slug: string }> = [];
	for (const review of E2E_FIXTURE_REVIEWS) {
		reviews.push(
			await upsertReview(payload, review, {
				authorId: author.id,
				coverId,
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
