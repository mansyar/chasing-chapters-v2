import { describe, expect, test } from "bun:test";
import {
	formatDate,
	formatRelativeTime,
	normalizeLocale,
} from "@/lib/date-format";

describe("normalizeLocale", () => {
	test("maps 'id' to id locale", () => {
		expect(normalizeLocale("id")).toBe("id");
	});

	test("maps undefined/null/unknown to en default", () => {
		expect(normalizeLocale(undefined)).toBe("en");
		expect(normalizeLocale(null)).toBe("en");
		expect(normalizeLocale("fr")).toBe("en");
		expect(normalizeLocale("en")).toBe("en");
	});
});

describe("formatDate", () => {
	const date = new Date("2026-01-15T00:00:00Z");

	test("formats long date in English", () => {
		const result = formatDate(date, "en");
		expect(result).toContain("January");
		expect(result).toContain("2026");
		expect(result).toContain("15");
	});

	test("formats long date in Indonesian", () => {
		const result = formatDate(date, "id");
		expect(result).toContain("Januari");
		expect(result).toContain("2026");
	});

	test("formats short month when requested", () => {
		const result = formatDate(date, "en", { month: "short" });
		expect(result).toContain("Jan");
		expect(result).not.toContain("January");
	});

	test("returns empty string for invalid dates", () => {
		expect(formatDate(new Date("not-a-date"), "en")).toBe("");
		expect(formatDate(undefined, "en")).toBe("");
		expect(formatDate(null, "en")).toBe("");
	});
});

describe("formatRelativeTime", () => {
	test("returns English relative time for en", () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		const result = formatRelativeTime(twoHoursAgo, "en");
		expect(result).toContain("2");
		expect(result.toLowerCase()).toContain("hour");
	});

	test("returns Indonesian relative time for id", () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		const result = formatRelativeTime(twoHoursAgo, "id");
		expect(result).toContain("2");
		expect(result.toLowerCase()).toContain("jam");
	});

	test("returns empty string for invalid dates", () => {
		expect(formatRelativeTime(new Date("not-a-date"), "en")).toBe("");
		expect(formatRelativeTime(undefined, "en")).toBe("");
		expect(formatRelativeTime(null, "en")).toBe("");
	});
});
