import { describe, expect, test } from "bun:test";
import {
	type Dictionary,
	type DictionaryKey,
	getDictionary,
} from "@/lib/i18n/dictionary";
import { formatMessage } from "@/lib/i18n/format";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locale";
import { formatReadingTime } from "@/lib/reading-time";

describe("dictionary parity", () => {
	test("both locales expose an identical key set", () => {
		const english = Object.keys(getDictionary("en")).sort();
		const indonesian = Object.keys(getDictionary("id")).sort();

		expect(english).toEqual(indonesian);
	});

	test("every locale is covered and no dictionary is empty", () => {
		for (const locale of SUPPORTED_LOCALES) {
			const dictionary: Dictionary = getDictionary(locale);

			expect(Object.keys(dictionary).length).toBeGreaterThan(0);
		}
	});

	test("no locale carries a blank string", () => {
		const blanks = (
			Object.entries(getDictionary("id")) as [DictionaryKey, string][]
		).filter(([, value]) => value.trim() === "");

		expect(blanks).toEqual([]);
	});

	test("the TOC, quote, and reading-time strings exist in both locales", () => {
		const english = getDictionary("en");
		const indonesian = getDictionary("id");
		const keys: DictionaryKey[] = [
			"reviewOnThisPage",
			"reviewCopyLink",
			"reviewCopyQuote",
			"reviewShareQuote",
			"reviewReadingTime",
			"shareCopied",
			"shareLinkCopied",
			"shareCopyFailed",
		];

		for (const key of keys) {
			expect(english[key].trim()).not.toBe("");
			expect(indonesian[key].trim()).not.toBe("");
			expect(indonesian[key]).not.toBe(english[key]);
		}

		const englishLabel = formatReadingTime(5, english.reviewReadingTime);
		const indonesianLabel = formatReadingTime(5, indonesian.reviewReadingTime);

		expect(englishLabel).toBe("5 min read");
		expect(indonesianLabel).toBe("5 mnt baca");
	});

	test("the two locales actually differ where the copy is ours", () => {
		const english = getDictionary("en");
		const indonesian = getDictionary("id");

		expect(indonesian.navReviews).not.toBe(english.navReviews);
		expect(indonesian.homeLatestReviews).not.toBe(english.homeLatestReviews);
		expect(indonesian.aboutTitle).not.toBe(english.aboutTitle);
	});

	test("the language labels name each language in its own words", () => {
		for (const locale of SUPPORTED_LOCALES) {
			const dictionary = getDictionary(locale);

			expect(dictionary.languageEnglish).toBe("English");
			expect(dictionary.languageIndonesian).toBe("Bahasa Indonesia");
		}
	});
});

describe("getDictionary", () => {
	test("returns the requested locale", () => {
		expect(getDictionary("id").navReviews).toBe("Ulasan");
		expect(getDictionary("en").navReviews).toBe("Reviews");
	});

	test("falls back to English for anything unsupported", () => {
		for (const value of ["fr", "ID", "", undefined, null, 42]) {
			expect(getDictionary(value).navReviews).toBe("Reviews");
		}
	});
});

describe("formatMessage", () => {
	test("fills a placeholder", () => {
		expect(
			formatMessage('Search Results for "{query}"', { query: "dune" }),
		).toBe('Search Results for "dune"');
	});

	test("fills several placeholders and accepts numbers", () => {
		expect(formatMessage("Page {page}", { page: 3 })).toBe("Page 3");
		expect(
			formatMessage("Get {count} {unit}", { count: 2, unit: "books" }),
		).toBe("Get 2 books");
	});

	test("leaves text with no placeholders untouched", () => {
		expect(formatMessage("Reviews")).toBe("Reviews");
	});

	test("leaves an unknown placeholder visible instead of blanking it", () => {
		expect(formatMessage("Hello {name}", {})).toBe("Hello {name}");
	});

	test("does not treat a brace-less template as one", () => {
		expect(formatMessage("{not a placeholder}", {})).toBe(
			"{not a placeholder}",
		);
	});
});
