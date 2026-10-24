import { describe, expect, it } from "bun:test";
import {
	buildPreviewMetadata,
	canRenderDraft,
	isSameOriginPath,
	otherLocale,
	reviewPath,
} from "../preview";

describe("preview", () => {
	describe("canRenderDraft", () => {
		it("renders a draft only when the cookie and a session are both present", () => {
			expect(canRenderDraft({ draftEnabled: true, hasSession: true })).toBe(
				true,
			);
		});

		it("falls back to the public view when the session expired", () => {
			// The bypass cookie outlives a logout, so this case is the one that
			// decides whether draft content can leak to a signed-out browser.
			expect(canRenderDraft({ draftEnabled: true, hasSession: false })).toBe(
				false,
			);
		});

		it("renders the public view for a signed-in reader without draft mode", () => {
			expect(canRenderDraft({ draftEnabled: false, hasSession: true })).toBe(
				false,
			);
			expect(canRenderDraft({ draftEnabled: false, hasSession: false })).toBe(
				false,
			);
		});
	});

	describe("reviewPath", () => {
		it("builds the public review path for each locale", () => {
			expect(reviewPath("a-review", "en")).toBe("/en/reviews/a-review");
			expect(reviewPath("a-review", "id")).toBe("/id/reviews/a-review");
		});
	});

	describe("otherLocale", () => {
		it("offers the locale the page is not rendered in", () => {
			expect(otherLocale("en")).toBe("id");
			expect(otherLocale("id")).toBe("en");
		});
	});

	describe("isSameOriginPath", () => {
		it("accepts a rooted same-origin path", () => {
			expect(isSameOriginPath("/en/reviews/a-review")).toBe(true);
			expect(isSameOriginPath("/")).toBe(true);
		});

		it("rejects anything that would leave the site", () => {
			// `//host` (and its `/\host` variant, which browsers normalize) is a
			// protocol-relative URL to another origin.
			expect(isSameOriginPath("//evil.example.com")).toBe(false);
			expect(isSameOriginPath("/\\evil.example.com")).toBe(false);
			expect(isSameOriginPath("https://evil.example.com")).toBe(false);
			expect(isSameOriginPath("reviews/a-review")).toBe(false);
			expect(isSameOriginPath("")).toBe(false);
		});

		it("rejects a value that is not a path at all", () => {
			expect(isSameOriginPath(null)).toBe(false);
			expect(isSameOriginPath(undefined)).toBe(false);
			expect(isSameOriginPath(42)).toBe(false);
		});
	});

	describe("buildPreviewMetadata", () => {
		const metadata = buildPreviewMetadata({
			title: "Draft Review",
			description: "A review that is not published yet.",
		});

		it("asks search engines not to index or follow the page", () => {
			expect(metadata.robots).toEqual({ index: false, follow: false });
		});

		it("keeps the title and description so the author knows what they see", () => {
			expect(metadata.title).toBe("Draft Review");
			expect(metadata.description).toBe("A review that is not published yet.");
		});

		it("drops the canonical address and the language alternates", () => {
			// A preview must never nominate itself as the review's address in
			// either language, so `alternates` is absent rather than filtered.
			expect(metadata.alternates).toBeUndefined();
		});

		it("suppresses the Open Graph image by stating an empty list", () => {
			// An absent `images` key is not enough: Next would fall back to the
			// route's `opengraph-image.tsx` file convention.
			expect(metadata.openGraph?.images).toEqual([]);
		});
	});
});
