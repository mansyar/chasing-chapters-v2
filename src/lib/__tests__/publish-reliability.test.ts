import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import type { Review } from "../../payload-types";
import type { E2EFixtureRichText } from "../e2e-harness";
import {
	isPubliclyVisible,
	publishedAndVisibleWhere,
} from "../publish-visibility";

/**
 * Regression test for the 2026-10-28 publish incident.
 *
 * A publish ran its `afterChange` chain - the `revalidatePath` calls and the
 * neighbour lookup - *inside* the write transaction, so that work shared the
 * write's connection budget. Under a constrained pool the neighbour lookup
 * asked for one connection more than the pool had, waited out the acquire
 * timeout, and threw; the throw rolled the publish back. The author got a
 * success toast and the review stayed a draft.
 *
 * This reproduces the pool, not the neighbour query's speed: one connection is
 * held for the duration of the publish, the way the translation pipeline's own
 * write or a public page render holds one, and the publish's transaction takes
 * the last connection the pool has left. Anything the write chain starts on top
 * of that has nothing to run on - and the publish still has to commit.
 *
 * The whole file is gated on `DATABASE_URI`: without a database there is no
 * pool to starve, and `bun test` stays runnable on a machine with no services.
 * The connection is the developer's own, and the rows it creates are deleted
 * again in `afterAll`.
 */
const SKIP_REASON =
	"DATABASE_URI is not set, so the pooled Postgres this test needs is unavailable";

if (!process.env.DATABASE_URI) {
	console.warn(`[publish-reliability] skipped: ${SKIP_REASON}`);
}

/**
 * The pool this test builds: three, so that a connection can be held, Payload's
 * own probe can hold one, and the publish still has exactly one to run on. A
 * publish that fits in that one commits; one that asks for a second - which is
 * every query an `afterChange` hook starts - does not.
 */
const POOL_SIZE = 3;

/**
 * A suffix that keeps concurrent runs and repeated runs apart: the slug is
 * unique on the collection, and the author's email is unique too.
 */
function uniqueSuffix(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A created document's id as a number. The untyped `Payload` hands back
 * `number | string`, and this database's ids are numbers.
 */
function toId(id: number | string): number {
	return typeof id === "number" ? id : Number(id);
}

/**
 * One Lexical paragraph, in the shape `@payloadcms/richtext-lexical` stores,
 * so the required-body validator sees real text.
 */
function body(text: string): E2EFixtureRichText {
	return {
		root: {
			type: "root",
			format: "",
			indent: 0,
			version: 1,
			direction: null,
			children: [
				{
					type: "paragraph",
					format: "",
					indent: 0,
					version: 1,
					direction: null,
					textStyle: "",
					textFormat: 0,
					children: [
						{
							mode: "normal",
							text,
							type: "text",
							style: "",
							detail: 0,
							format: 0,
							version: 1,
						},
					],
				},
			],
		},
	};
}

const describeWithDatabase = describe.skipIf(!process.env.DATABASE_URI);

describeWithDatabase("publish reliability under a starved pool", () => {
	let client: Payload | null = null;
	let authorId: number | string | null = null;
	let coverId: number | string | null = null;
	let reviewId: number | string | null = null;
	let slug = "";

	beforeAll(async () => {
		const { buildConfig, getPayload } = await import("payload");
		const { postgresAdapter } = await import("@payloadcms/db-postgres");
		const { lexicalEditor } = await import("@payloadcms/richtext-lexical");
		const { default: sharp } = await import("sharp");
		const { Authors } = await import("../../collections/Authors");
		const { Commenters } = await import("../../collections/Commenters");
		const { Comments } = await import("../../collections/Comments");
		const { Genres } = await import("../../collections/Genres");
		const { Media } = await import("../../collections/Media");
		const { MoodTags } = await import("../../collections/MoodTags");
		const { ReadingLists } = await import("../../collections/ReadingLists");
		const { Reviews } = await import("../../collections/Reviews");
		const { Tags } = await import("../../collections/Tags");

		/**
		 * The app's own collections on the app's own database, with the one
		 * difference this test exists to create: a pool with no spare
		 * connection left over.
		 *
		 * It is a config of its own rather than `@payload-config` for two
		 * reasons. The pool is a constant in the app config until pool sizing
		 * becomes configuration, so it cannot be narrowed from outside; and the
		 * app config registers the R2 storage plugin by default, which would
		 * send this test's cover upload to object storage. Neither is what is
		 * under test - the collection hooks are.
		 */
		const config = buildConfig({
			secret: "publish-reliability-test-secret-32-chars",
			localization: {
				locales: [
					{ label: "English", code: "en" },
					{ label: "Indonesia", code: "id" },
				],
				defaultLocale: "en",
				fallback: true,
			},
			collections: [
				Authors,
				Media,
				Genres,
				Tags,
				MoodTags,
				Reviews,
				ReadingLists,
				Comments,
				Commenters,
			],
			editor: lexicalEditor(),
			// No admin panel, no generated types and no schema push: the
			// database already carries the migrated schema, and this test must
			// not rewrite it.
			admin: { importMap: { autoGenerate: false } },
			typescript: { autoGenerate: false },
			db: postgresAdapter({
				pool: {
					connectionString: process.env.DATABASE_URI,
					max: POOL_SIZE,
					min: 0,
					connectionTimeoutMillis: 10_000,
				},
				push: false,
			}),
			sharp,
		});

		client = await getPayload({ config, key: "publish-reliability" });

		authorId = (
			await client.create({
				collection: "authors",
				data: {
					email: `publish-reliability-${uniqueSuffix()}@example.test`,
					password: "publish-reliability-password",
					name: "Publish Reliability Fixture",
					role: "admin",
				},
				context: { skipTranslation: true },
			})
		).id;

		const cover = await sharp({
			create: {
				width: 40,
				height: 60,
				channels: 3,
				background: "#182a44",
			},
		})
			.png()
			.toBuffer();

		coverId = (
			await client.create({
				collection: "media",
				data: { alt: `publish-reliability-${uniqueSuffix()}` },
				file: {
					data: cover,
					mimetype: "image/png",
					name: "publish-reliability-cover.png",
					size: cover.length,
				},
				context: { skipTranslation: true },
			})
		).id;
	}, 120_000);

	afterAll(async () => {
		if (!client) {
			return;
		}

		if (reviewId !== null) {
			await client.delete({ collection: "reviews", id: reviewId });
		}
		if (coverId !== null) {
			await client.delete({ collection: "media", id: coverId });
		}
		if (authorId !== null) {
			await client.delete({ collection: "authors", id: authorId });
		}

		await client.db.destroy?.();
	}, 60_000);

	it("commits a publish while the pool has no spare connection", async () => {
		if (!client || authorId === null || coverId === null) {
			throw new Error("The test fixture did not boot.");
		}

		slug = `publish-reliability-${uniqueSuffix()}`;

		// A draft first, exactly as the author leaves it before publishing.
		const draft = await client.create({
			collection: "reviews",
			data: {
				title: "Publish Reliability Fixture",
				slug,
				bookAuthor: "Fixture Author",
				rating: 4,
				coverImage: toId(coverId),
				reviewContent: body("A review that has to survive a starved pool."),
				author: toId(authorId),
			},
			draft: true,
			context: { skipTranslation: true },
		});
		reviewId = draft.id;

		// `payload.db` is typed as the generic adapter, but this config built a
		// Postgres one, and its pool is what this test fills.
		const pool = (client.db as unknown as PostgresAdapter).pool;

		// One connection held, the way the translation pipeline's own write or a
		// public page render holds one. Payload keeps another for its reconnect
		// probe, so what is left for the publish is exactly one connection: the
		// one its transaction runs on, and no more.
		const held = await pool.connect();

		let published: Awaited<ReturnType<typeof client.update>>;
		try {
			published = await client.update({
				collection: "reviews",
				id: draft.id,
				draft: false,
				data: { _status: "published" },
				context: { skipTranslation: true },
			});
		} finally {
			held.release();
		}

		// The untyped `Payload` returns a union of every collection's document;
		// these reads are of one review, and this test knows which.
		expect((published as Review)._status).toBe("published");

		// Commit is not enough on its own: the row has to be readable as a
		// reader sees it, or the author still has nothing to look at.
		const reread = (await client.findByID({
			collection: "reviews",
			id: draft.id,
			draft: false,
			depth: 0,
			overrideAccess: true,
		})) as Review;

		expect(reread._status).toBe("published");
		expect(isPubliclyVisible(reread, new Date())).toBe(true);

		const publicRead = (await client.find({
			collection: "reviews",
			where: {
				and: [publishedAndVisibleWhere(new Date()), { slug: { equals: slug } }],
			},
			limit: 1,
			depth: 0,
			overrideAccess: false,
		})) as { docs: Review[] };

		expect(publicRead.docs.map((doc) => doc.slug)).toEqual([slug]);
	}, 60_000);
});
