import { afterEach, describe, expect, it } from "bun:test";
import { resolveMediaUrl } from "../media-url";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

afterEach(() => {
	if (ORIGINAL_ENV === undefined) {
		delete process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
	} else {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL = ORIGINAL_ENV;
	}
});

describe("resolveMediaUrl", () => {
	it("maps a Payload media proxy path to the public R2 domain", () => {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL =
			"https://storage.chasing-chapters.com";
		expect(resolveMediaUrl("/api/media/file/fixture-cover.tmp-3.png")).toBe(
			"https://storage.chasing-chapters.com/fixture-cover.tmp-3.png",
		);
	});

	it("keeps an already-encoded filename as-is (no double encoding)", () => {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL =
			"https://storage.chasing-chapters.com";
		expect(
			resolveMediaUrl("/api/media/file/WhatsApp%20Image%202025-12-04.jpg"),
		).toBe(
			"https://storage.chasing-chapters.com/WhatsApp%20Image%202025-12-04.jpg",
		);
	});

	it("passes the url through unchanged when the env var is unset", () => {
		delete process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
		expect(resolveMediaUrl("/api/media/file/fixture-cover.tmp-3.png")).toBe(
			"/api/media/file/fixture-cover.tmp-3.png",
		);
	});

	it("passes already-absolute urls through unchanged", () => {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL =
			"https://storage.chasing-chapters.com";
		const external = "https://example.com/cover.jpg";
		expect(resolveMediaUrl(external)).toBe(external);
	});

	it("passes non-media relative paths through unchanged", () => {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL =
			"https://storage.chasing-chapters.com";
		expect(resolveMediaUrl("/some/other/path.png")).toBe(
			"/some/other/path.png",
		);
	});

	it("returns falsy input unchanged", () => {
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL =
			"https://storage.chasing-chapters.com";
		expect(resolveMediaUrl(null)).toBe(null);
		expect(resolveMediaUrl(undefined)).toBe(undefined);
	});
});
