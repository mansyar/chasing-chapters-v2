import { describe, expect, it } from "bun:test";
import type { CollectionConfig, Field } from "payload";
import formatSlug from "../../hooks/formatSlug";
import {
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_READING_LIST_LOCALIZED,
	E2E_FIXTURE_TAXONOMY,
	E2E_FIXTURE_TAXONOMY_LOCALIZED,
} from "../../lib/e2e-harness";
import type { Review } from "../../payload-types";
import { Genres } from "../Genres";
import { MoodTags } from "../MoodTags";
import { ReadingLists } from "../ReadingLists";
import { Reviews } from "../Reviews";
import { Tags } from "../Tags";

/** The top-level field a collection stores under `name`. */
function field(config: CollectionConfig, name: string): Field {
	const found = config.fields.find(
		(candidate) => "name" in candidate && candidate.name === name,
	);

	if (!found) {
		throw new Error(`${config.slug} has no ${name} field`);
	}

	return found;
}

/** The names of the fields the collection declares as localizable. */
function localizedNames(config: CollectionConfig): string[] {
	return config.fields
		.filter(
			(candidate) => "localized" in candidate && candidate.localized === true,
		)
		.map((candidate) => ("name" in candidate ? String(candidate.name) : ""))
		.sort();
}

/**
 * Runs the field's own validator the way Payload would, with a fake request.
 *
 * `required` is not what enforces the rule: Payload reads it on a localized
 * field as "required in every locale", which rejects the partial translation
 * writes the collection configs now allow (`requireDefaultLocaleValue`
 * documents why). The review body's `required` is asserted on its own, because
 * the generated type follows that flag.
 */
function validate(
	config: CollectionConfig,
	name: string,
	value: unknown,
	locale: string | undefined,
	operation: "create" | "update" = "update",
): unknown {
	const candidate = field(config, name);

	if (!("validate" in candidate) || typeof candidate.validate !== "function") {
		throw new Error(`expected ${name} to declare a validator`);
	}

	const run = candidate.validate as unknown as (
		value: unknown,
		args: unknown,
	) => unknown;

	return run(value, {
		operation,
		req: {
			locale,
			payload: { config: { localization: { defaultLocale: "en" } } },
		},
	});
}

/** A validator's verdict: `true` when the value is accepted. */
function isRejected(verdict: unknown): boolean {
	return typeof verdict === "string";
}

/**
 * The localized-field contract (`FR-10`).
 *
 * The taxonomy names, the reading-list title and description and the review
 * title are the fields an author may write in Indonesian. Everything else
 * stays single-valued: a localized slug would fork the URLs, and a color or an
 * icon is not language.
 */
const LOCALIZED_FIELDS: Array<{
	collection: string;
	config: CollectionConfig;
	fields: string[];
}> = [
	{ collection: "genres", config: Genres, fields: ["name"] },
	{ collection: "tags", config: Tags, fields: ["description", "name"] },
	{ collection: "mood-tags", config: MoodTags, fields: ["name"] },
	{
		collection: "reading-lists",
		config: ReadingLists,
		fields: ["description", "title"],
	},
	// The review body has been localizable since before this track; the title
	// joins it now that an author can supply the Indonesian book title.
	{
		collection: "reviews",
		config: Reviews,
		fields: [
			"favoriteQuotes",
			"perfectFor",
			"reviewContent",
			"title",
			"whatCouldBeBetter",
			"whatILoved",
		],
	},
];

/** The localized fields whose default-locale value a document must have. */
const REQUIRED_DEFAULT_LOCALE: Array<[CollectionConfig, string]> = [
	[Genres, "name"],
	[Tags, "name"],
	[MoodTags, "name"],
	[ReadingLists, "title"],
	[Reviews, "title"],
	// The body joins the list because the `id` locale may clear it and fall
	// back to the English one; the default locale is still enforced.
	[Reviews, "reviewContent"],
];

describe("content localization (FR-10)", () => {
	for (const { collection, config, fields } of LOCALIZED_FIELDS) {
		it(`localizes exactly the language-bearing fields of ${collection}`, () => {
			expect(localizedNames(config)).toEqual(fields);
		});
	}

	it("requires the value in the default locale", () => {
		// The English value is what a document is created with, and it is what
		// an empty Indonesian value falls back to. A document with neither
		// value has nothing to render, so the default locale is enforced.
		for (const [config, name] of REQUIRED_DEFAULT_LOCALE) {
			expect(isRejected(validate(config, name, "", "en"))).toBe(true);
			expect(isRejected(validate(config, name, undefined, undefined))).toBe(
				true,
			);
			expect(validate(config, name, "A value", "en")).toBe(true);
		}
	});

	it("treats a textless editor state as a blank default-locale value", () => {
		// A `richText` field never receives a string: clearing the editor
		// submits an editor state whose root carries no text, which Payload's
		// own rich-text validator rejects. A body saved that way in the
		// default locale leaves both languages with nothing to render (FR-10).
		const textless = {
			root: {
				type: "root",
				children: [{ children: [], type: "paragraph", version: 1 }],
			},
		};
		const whitespaceOnly = {
			root: {
				type: "root",
				children: [
					{
						children: [{ text: "   ", type: "text" }],
						type: "paragraph",
						version: 1,
					},
				],
			},
		};

		expect(isRejected(validate(Reviews, "reviewContent", textless, "en"))).toBe(
			true,
		);
		expect(
			isRejected(validate(Reviews, "reviewContent", whitespaceOnly, "en")),
		).toBe(true);
		// The `id` locale may still clear the body and fall back to English.
		expect(validate(Reviews, "reviewContent", textless, "id")).toBe(true);
	});

	it("accepts an editor state that carries text", () => {
		// The shape a saved body actually has, so the case above cannot pass by
		// rejecting every rich-text value.
		const written = {
			root: {
				type: "root",
				children: [
					{
						children: [{ text: "The English body.", type: "text" }],
						type: "paragraph",
						version: 1,
					},
				],
			},
		};

		expect(validate(Reviews, "reviewContent", written, "en")).toBe(true);
	});

	it("accepts an editor state whose only content is an atomic leaf", () => {
		// A body that is one image is not blank: an upload node is a childless
		// leaf that carries content of its own, and lexical's `hasText` reports
		// such a document as having text. Reading it as blank would refuse a
		// published review whose English body is a picture.
		const imageOnly = {
			root: {
				type: "root",
				children: [
					{
						type: "upload",
						value: { id: 1, url: "/cover.png" },
						version: 1,
					},
				],
			},
		};

		expect(validate(Reviews, "reviewContent", imageOnly, "en")).toBe(true);
	});

	it("accepts an empty translation so the fallback can fill it", () => {
		// `payload.update({ locale: "id", data: {...} })` - the translation
		// pipeline and an author's partial write - must not be rejected for
		// leaving the localized value out (FR-10).
		for (const [config, name] of REQUIRED_DEFAULT_LOCALE) {
			expect(validate(config, name, undefined, "id")).toBe(true);
			expect(validate(config, name, "", "id")).toBe(true);
		}
	});

	it("refuses to create a document in a non-default locale", () => {
		// Otherwise a document could exist whose English column is empty and
		// whose Indonesian column is not, which falls back to nothing.
		for (const [config, name] of REQUIRED_DEFAULT_LOCALE) {
			expect(isRejected(validate(config, name, "Nilai", "id", "create"))).toBe(
				true,
			);
			expect(validate(config, name, "A value", "en", "create")).toBe(true);
		}
	});

	it("leaves the review body out of `required` so its generated type stays nullable", () => {
		// Payload builds the generated type's nullability from `required`, so
		// marking the body required would make `reviewContent` non-nullable
		// again - and the `id` locale may clear it. The default locale is held
		// by the validator instead, and this assertion is what catches a drift
		// before the next regeneration does.
		const body = field(Reviews, "reviewContent") as { required?: boolean };

		expect(body.required).not.toBe(true);
	});

	it("leaves the slugs, the colors and the icons single-valued", () => {
		// A localized slug would make /id/... address a different document
		// than /en/...; a color and an icon are not language at all.
		for (const [config, name] of [
			[Genres, "slug"],
			[Tags, "slug"],
			[MoodTags, "slug"],
			[MoodTags, "color"],
			[MoodTags, "icon"],
			[ReadingLists, "slug"],
			[Reviews, "slug"],
		] as const) {
			expect(localizedNames(config)).not.toContain(name);
		}
	});
});

describe("review title localization and the translation pipeline (FR-10)", () => {
	/** A minimal serialized Lexical paragraph. */
	function paragraph(text: string): Review["reviewContent"] {
		return {
			root: {
				type: "root",
				children: [{ type: "paragraph", children: [{ type: "text", text }] }],
			},
		} as unknown as Review["reviewContent"];
	}

	function review(overrides: Partial<Review> = {}): Review {
		return {
			id: 1,
			title: "The Lighthouse Keeper's Almanac",
			_status: "published",
			autoTranslate: true,
			translationStatus: "translated",
			englishUpdatedAt: "2026-04-18T00:00:00.000Z",
			translationUpdatedAt: "2026-04-19T00:00:00.000Z",
			reviewContent: paragraph("The English body."),
			whatILoved: paragraph("The tide tables."),
			whatCouldBeBetter: paragraph("The middle third."),
			perfectFor: paragraph("Quiet readers."),
			favoriteQuotes: [],
			...overrides,
		} as Review;
	}

	it("does not treat an Indonesian title as a content change", async () => {
		// The title is a book title an author types by hand; the pipeline only
		// ever translates the review body. A title written in the `id` locale
		// arrives without any rich-text field, so it cannot count as a change.
		const { englishContentChanged } = await import(
			"../../hooks/translateReview"
		);

		expect(
			englishContentChanged({
				next: { title: "Almanak Penjaga Mercusuar" },
				previous: review(),
			}),
		).toBe(false);
	});

	it("does not hand a title-only save to the translation pipeline", async () => {
		const { decideTranslationAction } = await import(
			"../../hooks/translateReview"
		);

		expect(
			decideTranslationAction({
				doc: review({ title: "Almanak Penjaga Mercusuar" }),
				previousDoc: review(),
			}),
		).toBe("none");
	});

	it("still asks for a translation when the English body changes", async () => {
		const { decideTranslationAction } = await import(
			"../../hooks/translateReview"
		);

		expect(
			decideTranslationAction({
				doc: review({ reviewContent: paragraph("A rewritten body.") }),
				previousDoc: review(),
			}),
		).toBe("translate");
	});
});

describe("slug generation on a locale write (FR-10)", () => {
	const hook = formatSlug("name");
	type HookArgs = Parameters<typeof hook>[0];

	/** The hook argument Payload builds for a field it was not given a value. */
	function args(
		locale: string,
		data: Record<string, unknown>,
		originalSlug = "sci-fi",
	): HookArgs {
		return {
			value: undefined,
			data,
			originalDoc: { slug: originalSlug },
			req: {
				locale,
				payload: { config: { localization: { defaultLocale: "en" } } },
			},
		} as unknown as HookArgs;
	}

	it("keeps the default-locale slug when the Indonesian name is written", () => {
		// The translated name must never re-point the URL of the document: the
		// English and the Indonesian page address the same slug.
		expect(hook(args("id", { name: "Fiksi Ilmiah" }))).toBe("sci-fi");
	});

	it("keeps deriving the slug from the name in the default locale", () => {
		expect(hook(args("en", { name: "Fiksi Ilmiah" }))).toBe("fiksi-ilmiah");
	});

	it("keeps the derived slug even when the write carries an explicit one", () => {
		// An explicit slug on a translation would re-point the published URL,
		// so the document's own slug wins (FR-10).
		expect(
			hook({
				...(args("id", { name: "Fiksi Ilmiah" }) as object),
				value: "science-fiction",
			} as HookArgs),
		).toBe("sci-fi");
	});

	it("formats an explicit slug for a document that has none yet", () => {
		// Nothing to protect, so the write's own value is normalized rather
		// than stored as the author typed it.
		expect(
			hook({
				...args("id", { name: "Fiksi Ilmiah" }),
				value: "Science Fiction",
				originalDoc: {},
			} as HookArgs),
		).toBe("science-fiction");
	});
});

describe("e2e fixture localization (AC-9)", () => {
	it("writes an Indonesian value for at least one name of each kind", () => {
		for (const kind of ["genres", "tags", "moodTags"] as const) {
			const localized = Object.keys(E2E_FIXTURE_TAXONOMY_LOCALIZED[kind]);

			expect(localized.length).toBeGreaterThan(0);
			// A value can only be seeded for a name the fixture also creates.
			for (const name of localized) {
				expect(E2E_FIXTURE_TAXONOMY[kind] as readonly string[]).toContain(name);
			}
		}
	});

	it("leaves a name without an Indonesian value so the fallback is provable", () => {
		// Without one of these the browser suite could not tell a working
		// fallback from a page that never had a localized value to show.
		const untranslated = E2E_FIXTURE_TAXONOMY.genres.filter(
			(name) => !(name in E2E_FIXTURE_TAXONOMY_LOCALIZED.genres),
		);

		expect(untranslated).toContain("Fantasy");
	});

	it("declares an Indonesian reading-list title and description", () => {
		// The browser suite asserts these two strings on /id/..., so they have
		// to exist and differ from the English values they shadow.
		expect(E2E_FIXTURE_READING_LIST_LOCALIZED.title).not.toBe("");
		expect(E2E_FIXTURE_READING_LIST_LOCALIZED.description).not.toBe("");
		expect(E2E_FIXTURE_READING_LIST_LOCALIZED.title).not.toBe(
			E2E_FIXTURE_READING_LIST.title,
		);
		expect(E2E_FIXTURE_READING_LIST_LOCALIZED.description).not.toBe(
			E2E_FIXTURE_READING_LIST.description,
		);
	});
});
