import { describe, expect, it } from "bun:test";
import { buildSitemapEntries, type SitemapSource } from "../sitemap";

const SITE_URL = "https://chasing-chapters.com";
const lastModified = new Date("2026-01-15T00:00:00.000Z");

const sources: SitemapSource[] = [
	{ path: "/reviews", lastModified, changeFrequency: "daily", priority: 0.9 },
	{
		path: "/reviews/a-great-book",
		lastModified,
		changeFrequency: "monthly",
		priority: 0.8,
	},
];

describe("buildSitemapEntries", () => {
	it("lists every page once per locale", () => {
		const entries = buildSitemapEntries(sources, SITE_URL);

		expect(entries.map((entry) => entry.url)).toEqual([
			`${SITE_URL}/en/reviews`,
			`${SITE_URL}/id/reviews`,
			`${SITE_URL}/en/reviews/a-great-book`,
			`${SITE_URL}/id/reviews/a-great-book`,
		]);
	});

	it("names the reciprocal set from either locale", () => {
		const languages = {
			en: `${SITE_URL}/en/reviews/a-great-book`,
			id: `${SITE_URL}/id/reviews/a-great-book`,
			"x-default": `${SITE_URL}/en/reviews/a-great-book`,
		};

		const entries = buildSitemapEntries(sources, SITE_URL).filter((entry) =>
			entry.url.includes("a-great-book"),
		);

		expect(entries).toHaveLength(2);
		for (const entry of entries) {
			expect(entry.alternates).toMatchObject({ languages });
		}
	});

	it("keeps the priority, frequency and lastModified of the source", () => {
		const [english] = buildSitemapEntries(sources, SITE_URL);

		expect(english?.priority).toBe(0.9);
		expect(english?.changeFrequency).toBe("daily");
		expect(english?.lastModified).toEqual(lastModified);
	});

	it("returns nothing for no sources", () => {
		expect(buildSitemapEntries([], SITE_URL)).toEqual([]);
	});
});
