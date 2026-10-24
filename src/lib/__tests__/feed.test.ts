import { describe, expect, it } from "bun:test";
import {
	buildRssFeed,
	escapeXml,
	FEED_ITEM_LIMIT,
	type FeedReview,
	getReviewExcerpt,
	rfc822,
} from "../feed";

const makeReview = (overrides: Partial<FeedReview> = {}): FeedReview => ({
	title: "A Great Book",
	slug: "a-great-book",
	publishDate: "2026-01-15T00:00:00.000Z",
	_status: "published",
	reviewContent: {
		root: {
			children: [{ text: "A short review body." }],
		},
	},
	...overrides,
});

/** The moment every `buildRssFeed` call in this file is built at. */
const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("feed", () => {
	describe("escapeXml", () => {
		it("escapes XML special characters", () => {
			expect(escapeXml(`A & B <tag> "quoted" 'single'`)).toBe(
				"A &amp; B &lt;tag&gt; &quot;quoted&quot; &apos;single&apos;",
			);
		});

		it("escapes ampersands without double-escaping entities", () => {
			expect(escapeXml("Rock & Roll")).toBe("Rock &amp; Roll");
		});

		it("leaves plain text untouched", () => {
			expect(escapeXml("plain text")).toBe("plain text");
		});
	});

	describe("rfc822", () => {
		it("formats an ISO string as RFC 822 GMT date", () => {
			expect(rfc822("2026-01-15T00:00:00.000Z")).toBe(
				"Thu, 15 Jan 2026 00:00:00 GMT",
			);
		});

		it("accepts a Date object", () => {
			expect(rfc822(new Date("2026-01-15T00:00:00.000Z"))).toBe(
				"Thu, 15 Jan 2026 00:00:00 GMT",
			);
		});
	});

	describe("getReviewExcerpt", () => {
		it("extracts plain text from rich text", () => {
			expect(getReviewExcerpt(makeReview().reviewContent)).toBe(
				"A short review body.",
			);
		});

		it("collapses whitespace and newlines", () => {
			const content = {
				root: { children: [{ text: "Line one.\n\nLine   two." }] },
			};
			expect(getReviewExcerpt(content)).toBe("Line one. Line two.");
		});

		it("truncates long text on a word boundary with an ellipsis", () => {
			const content = {
				root: { children: [{ text: "word ".repeat(80).trim() }] },
			};
			const excerpt = getReviewExcerpt(content, 50);
			expect(excerpt.length).toBeLessThanOrEqual(51);
			expect(excerpt.endsWith("…")).toBe(true);
			expect(excerpt).not.toMatch(/\s…$/);
		});

		it("returns empty string for empty content", () => {
			expect(getReviewExcerpt(null)).toBe("");
			expect(getReviewExcerpt({ root: { children: [] } })).toBe("");
		});
	});

	describe("buildRssFeed", () => {
		it("renders RSS 2.0 channel metadata", () => {
			const xml = buildRssFeed({
				reviews: [],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain(`<rss version="2.0"`);
			expect(xml).toContain("<title>Chasing Chapters</title>");
			expect(xml).toContain("<link>https://chasing-chapters.com/en</link>");
			expect(xml).toContain("<language>en</language>");
			expect(xml).toContain("<lastBuildDate>");
			expect(xml).toContain(
				`<atom:link href="https://chasing-chapters.com/en/feed.xml" rel="self" type="application/rss+xml" />`,
			);
		});

		it("maps a review to an item with link, pubDate and excerpt", () => {
			const xml = buildRssFeed({
				reviews: [makeReview()],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain("<item>");
			expect(xml).toContain("<title>A Great Book</title>");
			expect(xml).toContain(
				"<link>https://chasing-chapters.com/en/reviews/a-great-book</link>",
			);
			expect(xml).toContain("<pubDate>Thu, 15 Jan 2026 00:00:00 GMT</pubDate>");
			expect(xml).toContain("A short review body.");
		});

		it("embeds the cover image in the description when present", () => {
			const xml = buildRssFeed({
				reviews: [
					makeReview({
						coverImage: { url: "https://cdn.example.com/cover.jpg" },
					}),
				],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain(
				`<description><![CDATA[<img src="https://cdn.example.com/cover.jpg" />`,
			);
			expect(xml).toContain(`<p>A short review body.</p>]]></description>`);
		});

		it("omits the cover image when absent", () => {
			const xml = buildRssFeed({
				reviews: [makeReview()],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).not.toContain("<img");
		});

		it("sorts items by publishDate descending", () => {
			const xml = buildRssFeed({
				reviews: [
					makeReview({
						title: "Older Review",
						slug: "older",
						publishDate: "2025-06-01T00:00:00.000Z",
					}),
					makeReview({
						title: "Newer Review",
						slug: "newer",
						publishDate: "2026-03-01T00:00:00.000Z",
					}),
				],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml.indexOf("Newer Review")).toBeLessThan(
				xml.indexOf("Older Review"),
			);
		});

		it("caps the feed at the configured item limit", () => {
			const reviews = Array.from({ length: FEED_ITEM_LIMIT + 5 }, (_, i) =>
				makeReview({
					title: `Review ${i}`,
					slug: `review-${i}`,
					publishDate: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
				}),
			);
			const xml = buildRssFeed({
				reviews,
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain(`Review ${FEED_ITEM_LIMIT + 4}`);
			expect(xml).not.toContain("Review 0<");
		});

		it("excludes draft reviews", () => {
			const xml = buildRssFeed({
				reviews: [
					makeReview({ title: "Published", _status: "published" }),
					makeReview({ title: "Draft Only", _status: "draft" }),
				],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain("<title>Published</title>");
			expect(xml).not.toContain("Draft Only");
		});

		it("excludes a published review whose schedule has not arrived", () => {
			// `_status` alone cannot answer this: the review is published, it
			// is simply not public yet (`FR-5`, `F7`).
			const xml = buildRssFeed({
				reviews: [
					makeReview({
						title: "Scheduled Later",
						slug: "scheduled-later",
						publishAt: "2030-01-01T00:00:00.000Z",
					}),
					makeReview({ title: "Already Out", slug: "already-out" }),
				],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});

			expect(xml).not.toContain("Scheduled Later");
			expect(xml).not.toContain("scheduled-later");
			expect(xml).toContain("<title>Already Out</title>");
		});

		it("escapes entities in titles and excerpts end to end", () => {
			const xml = buildRssFeed({
				reviews: [
					makeReview({
						title: "War & Peace <Review>",
						reviewContent: {
							root: { children: [{ text: "Love & loss <3" }] },
						},
					}),
				],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
			});
			expect(xml).toContain("<title>War &amp; Peace &lt;Review&gt;</title>");
			expect(xml).toContain("Love &amp; loss &lt;3");
			expect(xml).not.toContain("War & P");
		});

		it("declares the locale and links its own feed and items", () => {
			const xml = buildRssFeed({
				reviews: [makeReview({ title: "Almanak Penjaga", slug: "almanak" })],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
				locale: "id",
			});

			expect(xml).toContain("<language>id</language>");
			expect(xml).toContain("<link>https://chasing-chapters.com/id</link>");
			expect(xml).toContain(
				`<atom:link href="https://chasing-chapters.com/id/feed.xml" rel="self" type="application/rss+xml" />`,
			);
			expect(xml).toContain(
				"<link>https://chasing-chapters.com/id/reviews/almanak</link>",
			);
			expect(xml).toContain(
				'<guid isPermaLink="true">https://chasing-chapters.com/id/reviews/almanak</guid>',
			);
		});

		it("localizes the channel title and description", () => {
			const siteUrl = "https://chasing-chapters.com";
			const english = buildRssFeed({
				reviews: [],
				siteUrl,
				locale: "en",
				now: NOW,
			});
			const indonesian = buildRssFeed({
				reviews: [],
				siteUrl,
				locale: "id",
				now: NOW,
			});

			expect(english).toContain(
				"<description>Book reviews, reading lists, and literary notes from Chasing Chapters.</description>",
			);
			expect(indonesian).toContain(
				"<description>Ulasan buku, daftar bacaan, dan catatan sastra dari Chasing Chapters.</description>",
			);
			expect(english).not.toBe(indonesian);
		});

		it("normalizes an unsupported locale to English", () => {
			const xml = buildRssFeed({
				reviews: [],
				siteUrl: "https://chasing-chapters.com",
				now: NOW,
				locale: "fr",
			});

			expect(xml).toContain("<language>en</language>");
			expect(xml).toContain(
				`<atom:link href="https://chasing-chapters.com/en/feed.xml"`,
			);
		});
	});
});
