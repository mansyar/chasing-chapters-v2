/**
 * Shared, pure helpers for the Playwright e2e harness.
 *
 * The Playwright configuration and the bun unit tests need the same two
 * answers - how many workers the suite may use, and which port the
 * production server listens on - so both are resolved here, once, from the
 * environment. Keeping the logic out of `playwright.config.ts` is what makes
 * it testable: `bun test` only collects files under `src/`, so the helper and
 * its test live beside the other `src/lib` modules.
 *
 * The module must stay free of runtime imports (no database, no filesystem,
 * no server-only code): it is loaded by the Playwright config as well as by
 * the unit tests.
 */

/** Worker cap on a developer machine, chosen to leave headroom for the app, Postgres and Redis. */
export const DEFAULT_WORKER_COUNT = 3;

/** Worker count in CI, where the run has to be serial and deterministic. */
export const CI_WORKER_COUNT = 1;

/**
 * Port the e2e production server listens on. It is deliberately not 3000 so a
 * developer's running dev server cannot collide with the suite.
 */
export const DEFAULT_E2E_PORT = 3100;

/** The environment slice the harness reads. */
export type E2EEnv = Record<string, string | undefined>;

/**
 * CI is active for any non-empty value other than an explicit "false"/"0".
 */
function isCiActive(env: E2EEnv): boolean {
	const value = env.CI?.trim();
	if (value === undefined || value === "") {
		return false;
	}
	return value !== "false" && value !== "0";
}

/**
 * Parses a positive integer, ignoring anything that is not one.
 */
function parsePositiveInteger(raw: string | undefined): number | undefined {
	if (raw === undefined) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (trimmed === "") {
		return undefined;
	}
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return undefined;
	}
	return parsed;
}

/**
 * Resolves the worker count the e2e suite runs with.
 *
 * The rules, in order:
 * - `CI` pins the run to a single worker, because CI runs on a shared
 *   runner and must stay deterministic. It wins over the override.
 * - `PLAYWRIGHT_WORKERS` overrides the cap when it is a positive integer;
 *   a malformed value is ignored so a typo cannot crash the config.
 * - Otherwise the cap is {@link DEFAULT_WORKER_COUNT}, so the suite never
 *   occupies the machine's full logical CPU count.
 */
export function resolveWorkerCount(env: E2EEnv): number {
	if (isCiActive(env)) {
		return CI_WORKER_COUNT;
	}
	return parsePositiveInteger(env.PLAYWRIGHT_WORKERS) ?? DEFAULT_WORKER_COUNT;
}

/**
 * Resolves the port the e2e production server listens on.
 *
 * `E2E_PORT` overrides the default; a malformed or out-of-range value falls
 * back to {@link DEFAULT_E2E_PORT}.
 */
export function resolveE2EPort(env: E2EEnv): number {
	const override = parsePositiveInteger(env.E2E_PORT);
	if (override === undefined || override > 65535) {
		return DEFAULT_E2E_PORT;
	}
	return override;
}

/**
 * Resolves the base URL the suite navigates against. It always matches the
 * port the production server was started on.
 */
export function resolveE2EBaseURL(env: E2EEnv): string {
	return `http://localhost:${resolveE2EPort(env)}`;
}

/* -------------------------------------------------------------------------- *
 * The e2e database
 *
 * The suite must never write into the database the developer works in: the
 * fixture rows would then compete with the developer's own rows inside the
 * fixed-size windows the public pages use (the featured carousel, the curated
 * reading lists, the browse page), and the admin specs - which assert
 * collection-wide counts - would turn red on every review the developer
 * leaves in a failed or stale translation state.
 *
 * The e2e run therefore gets its own database, derived from the ambient
 * `DATABASE_URI` by appending a suffix to the database name. The derivation
 * is pure, so the Playwright configuration, the seed script and the unit
 * tests all agree on the same connection string.
 * -------------------------------------------------------------------------- */

/** The suffix the e2e database name carries. */
export const E2E_DATABASE_SUFFIX = "_e2e";

/**
 * The storage adapter the e2e run uses: Payload's own disk storage instead
 * of the S3 plugin, so the run needs no object storage credentials.
 */
export const E2E_STORAGE_ADAPTER = "local";

/**
 * Reads the database name out of a PostgreSQL connection string.
 */
function readDatabaseName(uri: string): string | undefined {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return undefined;
	}

	const segments = url.pathname.split("/").filter((segment) => segment !== "");
	const last = segments.at(-1);
	if (!last) {
		return undefined;
	}

	try {
		return decodeURIComponent(last);
	} catch {
		return undefined;
	}
}

/**
 * Resolves the name of the database the ambient connection string points at.
 */
export function resolveDatabaseName(env: E2EEnv): string | undefined {
	const uri = env.DATABASE_URI?.trim();
	if (!uri) {
		return undefined;
	}
	return readDatabaseName(uri);
}

/**
 * Resolves the connection string of the e2e database.
 *
 * The name of the ambient database is suffixed with {@link E2E_DATABASE_SUFFIX};
 * a URI that already points at an e2e database is returned unchanged, so the
 * resolution is idempotent and a run that already resolved the URI can resolve
 * it again without ending up in `..._e2e_e2e`.
 *
 * Everything else - host, port, credentials, query parameters - is preserved.
 * A missing or unparsable `DATABASE_URI` resolves to `undefined`: the caller
 * decides how to report it.
 */
export function resolveE2EDatabaseUri(env: E2EEnv): string | undefined {
	const uri = env.DATABASE_URI?.trim();
	if (!uri) {
		return undefined;
	}

	const name = readDatabaseName(uri);
	if (!name) {
		return undefined;
	}

	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		return undefined;
	}

	if (!name.endsWith(E2E_DATABASE_SUFFIX)) {
		url.pathname = `/${name}${E2E_DATABASE_SUFFIX}`;
	}

	return url.toString();
}

/* -------------------------------------------------------------------------- *
 * Deterministic fixture dataset
 *
 * The public specs assert against a known dataset instead of "whatever the
 * database happens to contain". Everything below is static data: fixed
 * identifiers, fixed titles, fixed dates. Nothing here reads the clock, the
 * filesystem or the database, so the same commit always produces the same
 * fixture (NFR-4).
 * -------------------------------------------------------------------------- */

/**
 * Rich text in the shape the Lexical editor stores. The fixture writes the
 * same structure the admin UI produces, so the public pages render it
 * without a translation round-trip.
 */
export type E2EFixtureRichText = {
	root: {
		type: "root";
		children: Array<{
			type: string;
			version: number;
			[k: string]: unknown;
		}>;
		direction: "ltr" | "rtl" | null;
		format: "" | "left" | "start" | "center" | "right" | "end" | "justify";
		indent: number;
		version: number;
	};
	[k: string]: unknown;
};

type E2EFixtureBlock = E2EFixtureRichText["root"]["children"][number];

/**
 * Builds one Lexical paragraph.
 */
function paragraph(text: string): E2EFixtureBlock {
	return {
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
	};
}

/**
 * Builds a Lexical document from plain paragraphs.
 */
function richText(...paragraphs: string[]): E2EFixtureRichText {
	return {
		root: {
			type: "root",
			format: "",
			indent: 0,
			version: 1,
			direction: null,
			children: paragraphs.map(paragraph),
		},
	};
}

/** The translation states the fixture seeds reviews in. */
export type E2EFixtureTranslationStatus = "translated" | "failed" | "stale";

/**
 * The localized content the fixture writes for the Indonesian locale.
 *
 * The admin surfaces only trust a review whose Indonesian content is really
 * there: a review that claims to be translated but has no Indonesian text
 * silently falls back to the English content on `?locale=id`.
 */
export type E2EFixtureLocalizedContent = {
	reviewContent: E2EFixtureRichText;
	whatILoved: E2EFixtureRichText;
	whatCouldBeBetter: E2EFixtureRichText;
	perfectFor: E2EFixtureRichText;
	favoriteQuotes: Array<{ quote: string; page: string }>;
};

/** A review the fixture creates. */
export type E2EFixtureReview = {
	/** Title shown on the public pages. */
	title: string;
	/** Stable slug - also the identifier the fixture upserts on. */
	slug: string;
	bookAuthor: string;
	rating: number;
	/** Fixed publication date - never `new Date()`. */
	publishDate: string;
	translationStatus: E2EFixtureTranslationStatus;
	/** Set for reviews whose translation is considered up to date. */
	translationUpdatedAt?: string;
	/** Set for reviews whose translation failed. */
	translationError?: string;
	featured: boolean;
	reviewContent: E2EFixtureRichText;
	whatILoved: E2EFixtureRichText;
	whatCouldBeBetter: E2EFixtureRichText;
	perfectFor: E2EFixtureRichText;
	favoriteQuotes: Array<{ quote: string; page: string }>;
	/**
	 * The Indonesian content. Only the reviews whose translation status is
	 * `translated` carry one - the other two are seeded in a state where the
	 * Indonesian content is missing on purpose.
	 */
	id?: E2EFixtureLocalizedContent;
	/** Taxonomy names - resolved to ids by the fixture. */
	genres: string[];
	tags: string[];
	moodTags: string[];
};

/**
 * The fixture account.
 *
 * The credential is a throwaway value that only ever exists in a test
 * database: the account is created by the fixture, it is not a real user and
 * it grants nothing outside the local test environment.
 */
export const E2E_FIXTURE_AUTHOR = {
	name: "E2E Fixture Admin",
	email: "e2e-admin@example.test",
	password: "e2e-fixture-password",
	role: "admin",
} as const;

/**
 * Taxonomy the fixture reviews reference by name. The names already exist in
 * a seeded database; the fixture creates the missing ones and never rewrites
 * the ones it does not own.
 */
export const E2E_FIXTURE_TAXONOMY = {
	genres: ["Sci-Fi", "Fantasy"],
	tags: ["Classic", "Hidden Gem"],
	moodTags: ["Adventurous", "Cozy"],
} as const;

/**
 * The details a mood tag needs when the fixture has to create it: the color
 * is a required field, the icon is not. The values match the ones the seed
 * script writes, so a fixture mood tag looks like any other one.
 */
export const E2E_FIXTURE_MOOD_TAG_DETAILS: Record<
	string,
	{ color: string; icon: string }
> = {
	Adventurous: { color: "#55EFC4", icon: "🗺️" },
	Cozy: { color: "#FF9F43", icon: "☕" },
};

/** The reading list the fixture creates. */
export const E2E_FIXTURE_READING_LIST = {
	title: "E2E Fixture: Rainy Season Reading List",
	slug: "e2e-fixture-rainy-season-reading-list",
	description:
		"Four fixture reviews for slow afternoons, collected by the end-to-end suite.",
	featured: true,
} as const;

/**
 * The cover the fixture attaches to its reviews.
 *
 * The fixture writes a small PNG into Payload's own disk storage - the e2e
 * run does not talk to object storage - so the reviews render the same
 * cover-first layout the production site does.
 */
export const E2E_FIXTURE_COVER = {
	alt: "E2E fixture cover",
	filename: "e2e-fixture-cover.png",
	mimeType: "image/png",
} as const;

/**
 * The seeded reviews.
 *
 * Two of them are featured so the homepage renders the carousel instead of
 * the single-review hero, and the four of them cover the three translation
 * states the admin surfaces care about.
 */
export const E2E_FIXTURE_REVIEWS: E2EFixtureReview[] = [
	{
		title: "E2E Fixture: The Lighthouse Keeper's Almanac",
		slug: "e2e-fixture-the-lighthouse-keepers-almanac",
		bookAuthor: "Wren Halloway",
		rating: 5,
		publishDate: "2026-04-18T00:00:00.000Z",
		translationStatus: "translated",
		translationUpdatedAt: "2026-04-19T00:00:00.000Z",
		featured: true,
		reviewContent: richText(
			"Wren Halloway's almanac of tides, gulls and burnt sugar is a book about paying attention.",
			"The keeper writes the weather into a ledger, and the reader slowly realises the storm is really about the town below.",
		),
		whatILoved: richText(
			"The tide tables double as a metaphor, and every entry sounds like it was written at four in the morning.",
		),
		whatCouldBeBetter: richText(
			"The middle third repeats itself, and the keeper's backstory arrives far too late to matter.",
		),
		perfectFor: richText(
			"Readers who like quiet, atmospheric books where the setting carries the story.",
		),
		favoriteQuotes: [
			{
				quote: "A lighthouse is just a promise that someone is still awake.",
				page: "42",
			},
		],
		id: {
			reviewContent: richText(
				"Buku Almanak Penjaga Mercusuar karya Wren Halloway adalah buku tentang Rye, yang selalu payah.",
				"Penjaga itu menulis cuaca di sebuah buku besar, dan pembaca perlahan menyadari bahwa badai itu sebenarnya tentang desa di bawahnya.",
			),
			whatILoved: richText(
				"Daftar pasang surutnya sekaligus berfungsi sebagai metafora, dan setiap barisnya terdengar seperti ditulis pukul empat pagi.",
			),
			whatCouldBeBetter: richText(
				"Tiga bagian tengahnya mengulang dirinya sendiri, dan latar belakang penjaga baru muncul jauh terlalu lambat.",
			),
			perfectFor: richText(
				"Pembaca yang menyukai buku sunyi dan atmosferis, tempat latar lokasi yang membawa cerita.",
			),
			favoriteQuotes: [
				{
					quote:
						"Sebuah mercusuar hanyalah janji bahwa masih ada orang yang terbangun.",
					page: "42",
				},
			],
		},
		genres: ["Sci-Fi"],
		tags: ["Classic"],
		moodTags: ["Adventurous"],
	},
	{
		title: "E2E Fixture: Salt and Paper Lanterns",
		slug: "e2e-fixture-salt-and-paper-lanterns",
		bookAuthor: "Ivo Marchetti",
		rating: 4,
		publishDate: "2026-04-11T00:00:00.000Z",
		translationStatus: "translated",
		translationUpdatedAt: "2026-04-12T00:00:00.000Z",
		featured: true,
		reviewContent: richText(
			"A festival novel in seven evenings, told through the people who carry the lanterns.",
			"It is warmer than it is profound, which is exactly what a rainy season asks for.",
		),
		whatILoved: richText(
			"The chapter written entirely as a recipe is the best page in the book.",
		),
		whatCouldBeBetter: richText(
			"The last hundred pages hurry through three endings at once.",
		),
		perfectFor: richText(
			"Readers who want something short, warm and readable in a single sitting.",
		),
		favoriteQuotes: [
			{
				quote: "Every festival is an argument about who gets to stay.",
				page: "118",
			},
		],
		id: {
			reviewContent: richText(
				"Roman festival dalam tujuh malam, diceritakan melalui orang-orang yang membawa lampion.",
				"Lebih hangat daripada dalam, dan itulah persis yang dibutuhkan musim hujan.",
			),
			whatILoved: richText(
				"Bab yang ditulis sepenuhnya sebagai resep adalah halaman terbaik di buku ini.",
			),
			whatCouldBeBetter: richText(
				"Seratus halaman terakhirnya terburu-buru melewati tiga akhir sekaligus.",
			),
			perfectFor: richText(
				"Pembaca yang menginginkan sesuatu yang pendek, hangat, dan bisa diselesaikan dalam sekali duduk.",
			),
			favoriteQuotes: [
				{
					quote:
						"Setiap festival adalah perdebatan tentang siapa yang berhak tetap tinggal.",
					page: "118",
				},
			],
		},
		genres: ["Fantasy"],
		tags: ["Hidden Gem"],
		moodTags: ["Cozy"],
	},
	{
		title: "E2E Fixture: The Cartographer's Error",
		slug: "e2e-fixture-the-cartographers-error",
		bookAuthor: "Noor Abadi",
		rating: 3,
		publishDate: "2026-03-28T00:00:00.000Z",
		translationStatus: "failed",
		translationError:
			"Fixture state: the translation provider request failed for this review.",
		featured: false,
		reviewContent: richText(
			"A mapmaker discovers a coastline that moves, and the book spends longer on the paperwork than on the mystery.",
		),
		whatILoved: richText(
			"The maps themselves are described well enough to make you want to draw them.",
		),
		whatCouldBeBetter: richText(
			"The coastline never stops moving long enough for the ending to land.",
		),
		perfectFor: richText(
			"Readers who like the idea of a puzzle more than the solving of it.",
		),
		favoriteQuotes: [],
		genres: ["Sci-Fi"],
		tags: ["Hidden Gem"],
		moodTags: ["Cozy"],
	},
	{
		title: "E2E Fixture: Nine Kinds of Weather",
		slug: "e2e-fixture-nine-kinds-of-weather",
		bookAuthor: "Tomas Iverson",
		rating: 4,
		publishDate: "2026-03-21T00:00:00.000Z",
		translationStatus: "stale",
		featured: false,
		reviewContent: richText(
			"Nine short stories, one per season, told by the same house across nine weathers.",
		),
		whatILoved: richText(
			"The winter chapter is the best of the nine, and the summer one is a close second.",
		),
		whatCouldBeBetter: richText(
			"Two of the middle seasons blur into one another.",
		),
		perfectFor: richText(
			"Readers who like linked short fiction and a house that changes slowly.",
		),
		favoriteQuotes: [],
		genres: ["Fantasy"],
		tags: ["Classic"],
		moodTags: ["Adventurous"],
	},
];

/** The review the public specs navigate to. */
export const E2E_FIXTURE_REVIEW = E2E_FIXTURE_REVIEWS[0];

/** The slug of the review the public specs navigate to. */
export const E2E_FIXTURE_REVIEW_SLUG = E2E_FIXTURE_REVIEW.slug;

/** The path of the review the public specs navigate to. */
export const E2E_FIXTURE_REVIEW_PATH = `/reviews/${E2E_FIXTURE_REVIEW_SLUG}`;

/** The path of the reading list the public specs navigate to. */
export const E2E_FIXTURE_READING_LIST_PATH = `/reading-lists/${E2E_FIXTURE_READING_LIST.slug}`;
