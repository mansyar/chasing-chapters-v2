import { expect, test } from "@playwright/test";
import {
	E2E_FIXTURE_READING_LIST,
	E2E_FIXTURE_READING_LIST_LOCALIZED,
	E2E_FIXTURE_READING_LIST_PATH,
	E2E_FIXTURE_REVIEW,
	E2E_FIXTURE_REVIEWS,
	E2E_FIXTURE_STALE_REVIEW_LOCALIZED,
	E2E_FIXTURE_TAXONOMY_LOCALIZED,
	type E2EFixtureReview,
	type E2EFixtureRichText,
} from "../src/lib/e2e-harness";
import { localePath } from "./fixtures/locale";

/**
 * Content localization (`FR-10`, `AC-9`).
 *
 * The fixture seeds an Indonesian value for one genre, one tag, one mood tag
 * and the reading list, and deliberately leaves the rest in English: that is
 * what lets these specs prove both halves of the requirement - a value the
 * author supplied is rendered, and a value the author left empty falls back to
 * the English one instead of rendering blank.
 */

/** The plain text of a serialized Lexical document, paragraphs joined. */
function plainText(document: E2EFixtureRichText): string {
	const root = (
		document as unknown as {
			root: { children: Array<{ children?: Array<{ text?: string }> }> };
		}
	).root;

	return root.children
		.map((node) =>
			(node.children ?? []).map((leaf) => leaf.text ?? "").join(""),
		)
		.join(" ");
}

/** The opening sentence of a fixture review's English body. */
function englishBodyOpening(review: E2EFixtureReview): string {
	return plainText(review.reviewContent).slice(0, 40);
}

/** The fixture review whose Indonesian content was actually written. */
const TRANSLATED_REVIEW = E2E_FIXTURE_REVIEW;
const TRANSLATED_REVIEW_PATH = `/reviews/${TRANSLATED_REVIEW.slug}`;

/** The opening of that review's Indonesian body. */
const INDONESIAN_BODY_OPENING = TRANSLATED_REVIEW.id
	? plainText(TRANSLATED_REVIEW.id.reviewContent).slice(0, 40)
	: "";

/** A second translated review - it carries the localized tag and mood tag. */
const SECOND_REVIEW = E2E_FIXTURE_REVIEWS[1];

/** One of the reviews seeded with no Indonesian content at all. */
const UNTRANSLATED_REVIEW = E2E_FIXTURE_REVIEWS[2];

/** The review the fixture gives an Indonesian title but no Indonesian body. */
const STALE_REVIEW = E2E_FIXTURE_REVIEWS[3];

test.describe("Content localization", () => {
	test("renders the Indonesian genre name on the Indonesian review page", async ({
		page,
	}) => {
		const indonesianGenre = E2E_FIXTURE_TAXONOMY_LOCALIZED.genres["Sci-Fi"];

		await page.goto(localePath(TRANSLATED_REVIEW_PATH, "id"));

		await expect(
			page.getByText(indonesianGenre, { exact: true }).first(),
		).toBeVisible();
		// The English name is not rendered anywhere on the Indonesian page.
		await expect(page.getByText("Sci-Fi", { exact: true })).toHaveCount(0);
	});

	test("keeps the English genre name on the English review page", async ({
		page,
	}) => {
		// The same document, read in the default locale: the English name is
		// still what the page shows.
		await page.goto(localePath(TRANSLATED_REVIEW_PATH, "en"));

		await expect(
			page.getByText("Sci-Fi", { exact: true }).first(),
		).toBeVisible();
		await expect(
			page.getByText(E2E_FIXTURE_TAXONOMY_LOCALIZED.genres["Sci-Fi"], {
				exact: true,
			}),
		).toHaveCount(0);
	});

	test("falls back to the English name for a genre with no Indonesian value", async ({
		page,
	}) => {
		// "Fantasy" is seeded without an Indonesian name on purpose.
		await page.goto(localePath(`/reviews/${SECOND_REVIEW.slug}`, "id"));

		await expect(
			page.getByText("Fantasy", { exact: true }).first(),
		).toBeVisible();
	});

	test("renders the localized tag and mood tag on the Indonesian review page", async ({
		page,
	}) => {
		await page.goto(localePath(`/reviews/${SECOND_REVIEW.slug}`, "id"));

		await expect(
			page
				.getByText(E2E_FIXTURE_TAXONOMY_LOCALIZED.tags["Hidden Gem"], {
					exact: true,
				})
				.first(),
		).toBeVisible();
		await expect(
			page
				.getByText(E2E_FIXTURE_TAXONOMY_LOCALIZED.moodTags.Cozy, {
					// The mood badge puts the icon before the name in the same
					// element, so its text is "\u2615Hangat", not "Hangat".
					exact: false,
				})
				.first(),
		).toBeVisible();
	});

	test("localizes the genre filter on the Indonesian browse page", async ({
		page,
	}) => {
		// The taxonomy list the browse page renders is read in the page's
		// locale too, so the filter names follow the reader.
		await page.goto(localePath("/reviews", "id"));

		await expect(
			page
				.getByRole("link", {
					name: E2E_FIXTURE_TAXONOMY_LOCALIZED.genres["Sci-Fi"],
				})
				.first(),
		).toBeVisible();
		// The genre left in English keeps its English name here as well.
		await expect(
			page.getByRole("link", { name: "Fantasy", exact: true }).first(),
		).toBeVisible();
	});

	test("renders the English review title while the body is Indonesian", async ({
		page,
	}) => {
		// This review carries no Indonesian title, so the title falls back to
		// the English book title even though the body is Indonesian.
		await page.goto(localePath(TRANSLATED_REVIEW_PATH, "id"));

		expect(INDONESIAN_BODY_OPENING).not.toBe("");
		await expect(page.locator("h1")).toHaveText(TRANSLATED_REVIEW.title);
		await expect(
			page.getByText(INDONESIAN_BODY_OPENING, { exact: false }).first(),
		).toBeVisible();
	});

	test("renders the Indonesian review title over the English body", async ({
		page,
	}) => {
		// The title is a localized field of its own (FR-10), so a review whose
		// body is still English can carry a translated heading - and the
		// metadata is built from the same locale-resolved title.
		await page.goto(localePath(`/reviews/${STALE_REVIEW.slug}`, "id"));

		await expect(page.locator("h1")).toHaveText(
			E2E_FIXTURE_STALE_REVIEW_LOCALIZED.title,
		);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			"content",
			new RegExp(E2E_FIXTURE_STALE_REVIEW_LOCALIZED.title),
		);
		// A translated title is not a translated review: the body stays
		// English. The assertion has to discriminate - the offline stub echoes
		// the source text inside a `[stub-id]` marker, and the admin bulk
		// re-translate spec translates this same review - so the English text
		// alone would also appear in a stubbed translation. The marker must be
		// absent for the English body to be the fallback it claims to be.
		const article = page.locator("article");
		await expect(article).toContainText(englishBodyOpening(STALE_REVIEW));
		await expect(article).not.toContainText("[stub-id]");

		// The English page is unaffected.
		await page.goto(localePath(`/reviews/${STALE_REVIEW.slug}`, "en"));

		await expect(page.locator("h1")).toHaveText(STALE_REVIEW.title);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute(
			"content",
			new RegExp(STALE_REVIEW.title),
		);
	});

	test("renders the English body for a review with no Indonesian content", async ({
		page,
	}) => {
		// The untranslated fixture reviews fall back to the English body rather
		// than an empty article (FR-10).
		await page.goto(localePath(`/reviews/${UNTRANSLATED_REVIEW.slug}`, "id"));

		await expect(page.locator("h1")).toHaveText(UNTRANSLATED_REVIEW.title);
		await expect(
			page
				.getByText(englishBodyOpening(UNTRANSLATED_REVIEW), { exact: false })
				.first(),
		).toBeVisible();
		// The admin bulk re-translate spec translates this review too, and the
		// offline stub echoes the English text inside a `[stub-id]` marker - so
		// the text above would also be visible through a stubbed translation.
		// The absent marker is what makes the English body a fallback.
		await expect(page.locator("article")).not.toContainText("[stub-id]");
	});

	test("renders the Indonesian reading-list title and description", async ({
		page,
	}) => {
		await page.goto(localePath("/reading-lists", "id"));

		await expect(
			page
				.getByRole("heading", {
					name: E2E_FIXTURE_READING_LIST_LOCALIZED.title,
				})
				.first(),
		).toBeVisible();
		await expect(
			page.getByText(E2E_FIXTURE_READING_LIST.title, { exact: true }),
		).toHaveCount(0);
	});

	test("renders the Indonesian reading list on its detail page", async ({
		page,
	}) => {
		await page.goto(localePath(E2E_FIXTURE_READING_LIST_PATH, "id"));

		await expect(page.locator("h1")).toHaveText(
			E2E_FIXTURE_READING_LIST_LOCALIZED.title,
		);
		await expect(
			page.getByText(E2E_FIXTURE_READING_LIST_LOCALIZED.description),
		).toBeVisible();
	});

	test("keeps the English reading list on the English pages", async ({
		page,
	}) => {
		await page.goto(localePath("/reading-lists", "en"));

		await expect(
			page
				.getByRole("heading", { name: E2E_FIXTURE_READING_LIST.title })
				.first(),
		).toBeVisible();
		await expect(
			page.getByText(E2E_FIXTURE_READING_LIST_LOCALIZED.title, { exact: true }),
		).toHaveCount(0);
	});
});
