import { describe, expect, it } from "bun:test";
import {
	absoluteLocaleUrl,
	buildLocaleShellMetadata,
	buildPageMetadata,
	localeLanguageAlternates,
} from "../metadata";
import { SITE_URL } from "../structured-data";

describe("absoluteLocaleUrl", () => {
	it("prefixes the locale onto the logical path", () => {
		expect(absoluteLocaleUrl("/reviews/some-book", "id")).toBe(
			`${SITE_URL}/id/reviews/some-book`,
		);
		expect(absoluteLocaleUrl("/", "en")).toBe(`${SITE_URL}/en`);
	});
});

describe("localeLanguageAlternates", () => {
	it("lists both locales plus an English x-default", () => {
		expect(localeLanguageAlternates("/about")).toMatchObject({
			en: `${SITE_URL}/en/about`,
			id: `${SITE_URL}/id/about`,
			"x-default": `${SITE_URL}/en/about`,
		});
	});
});

describe("buildPageMetadata", () => {
	const english = buildPageMetadata({
		locale: "en",
		path: "/reviews/some-book",
		title: "Some Book",
		description: "Read our review of Some Book.",
	});

	const indonesian = buildPageMetadata({
		locale: "id",
		path: "/reviews/some-book",
		title: "Some Book",
		description: "Baca ulasan Some Book.",
	});

	it("canonicalizes to the page's own locale", () => {
		expect(english.alternates).toMatchObject({
			canonical: `${SITE_URL}/en/reviews/some-book`,
		});
		expect(indonesian.alternates).toMatchObject({
			canonical: `${SITE_URL}/id/reviews/some-book`,
		});
	});

	it("advertises the same reciprocal set from either locale", () => {
		const expected = {
			en: `${SITE_URL}/en/reviews/some-book`,
			id: `${SITE_URL}/id/reviews/some-book`,
			"x-default": `${SITE_URL}/en/reviews/some-book`,
		};

		expect(english.alternates).toMatchObject({ languages: expected });
		expect(indonesian.alternates).toMatchObject({ languages: expected });
	});

	it("sets og:locale per locale with the other as alternate", () => {
		expect(english.openGraph).toMatchObject({
			locale: "en_US",
			alternateLocale: ["id_ID"],
			type: "website",
		});
		expect(indonesian.openGraph).toMatchObject({
			locale: "id_ID",
			alternateLocale: ["en_US"],
		});
	});

	it("advertises the locale's own feed as the document feed", () => {
		expect(english.alternates).toMatchObject({
			types: { "application/rss+xml": `${SITE_URL}/en/feed.xml` },
		});
		expect(indonesian.alternates).toMatchObject({
			types: { "application/rss+xml": `${SITE_URL}/id/feed.xml` },
		});
	});

	it("keeps the localized title and description it is given", () => {
		expect(indonesian.title).toBe("Some Book");
		expect(indonesian.description).toBe("Baca ulasan Some Book.");
		expect(indonesian.openGraph).toMatchObject({
			title: "Some Book",
			description: "Baca ulasan Some Book.",
		});
	});
});

describe("buildLocaleShellMetadata", () => {
	it("advertises the locale's feed and Open Graph locale", () => {
		expect(buildLocaleShellMetadata("id")).toMatchObject({
			alternates: {
				types: { "application/rss+xml": `${SITE_URL}/id/feed.xml` },
			},
			openGraph: { locale: "id_ID", alternateLocale: ["en_US"] },
		});
	});
});
