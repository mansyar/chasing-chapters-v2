import { describe, expect, it } from "bun:test";
import {
	canTransition,
	createFailedStatus,
	describeFailure,
	isStale,
	shouldBackfillToStale,
	TRANSLATION_STATUSES,
	type TranslationStatus,
} from "../translation-status";

describe("translation-status", () => {
	describe("TRANSLATION_STATUSES", () => {
		it("exposes exactly the five agreed states", () => {
			expect(TRANSLATION_STATUSES).toEqual([
				"untranslated",
				"pending",
				"translated",
				"failed",
				"stale",
			]);
		});

		it("only allows known states via canTransition type guard", () => {
			const statuses: TranslationStatus[] = [...TRANSLATION_STATUSES];
			for (const s of statuses) {
				expect(typeof canTransition(s, "pending")).toBe("boolean");
			}
		});
	});

	describe("canTransition", () => {
		it("allows untranslated -> pending (first translation starts)", () => {
			expect(canTransition("untranslated", "pending")).toBe(true);
		});

		it("allows untranslated -> translated (backfill of already-good docs)", () => {
			expect(canTransition("untranslated", "translated")).toBe(true);
		});

		it("allows pending -> translated (success)", () => {
			expect(canTransition("pending", "translated")).toBe(true);
		});

		it("allows pending -> failed (error)", () => {
			expect(canTransition("pending", "failed")).toBe(true);
		});

		it("allows translated -> stale (EN edited after translation)", () => {
			expect(canTransition("translated", "stale")).toBe(true);
		});

		it("allows failed -> pending (manual re-translate after failure)", () => {
			expect(canTransition("failed", "pending")).toBe(true);
		});

		it("allows translated -> pending (re-translate)", () => {
			expect(canTransition("translated", "pending")).toBe(true);
		});

		it("allows stale -> pending (re-translate after edit)", () => {
			expect(canTransition("stale", "pending")).toBe(true);
		});

		it("allows stale -> translated (format-sync refreshes a stale translation)", () => {
			expect(canTransition("stale", "translated")).toBe(true);
		});

		it("rejects invalid transitions", () => {
			expect(canTransition("translated", "untranslated")).toBe(false);
			expect(canTransition("pending", "stale")).toBe(false);
			expect(canTransition("failed", "translated")).toBe(false);
			expect(canTransition("untranslated", "failed")).toBe(false);
		});

		it("rejects unknown states defensively", () => {
			expect(canTransition("bogus" as TranslationStatus, "pending")).toBe(
				false,
			);
			expect(canTransition("pending", "bogus" as TranslationStatus)).toBe(
				false,
			);
		});
	});

	describe("isStale", () => {
		it("is stale when there is no translation timestamp at all", () => {
			expect(isStale("2026-10-08T00:00:00Z", null)).toBe(true);
			expect(isStale("2026-10-08T00:00:00Z", undefined)).toBe(true);
		});

		it("is stale when the translation is older than the last EN edit", () => {
			expect(isStale("2026-10-08T10:00:00Z", "2026-10-08T09:00:00Z")).toBe(
				true,
			);
		});

		it("is not stale when the translation is newer than the last EN edit", () => {
			expect(isStale("2026-10-08T09:00:00Z", "2026-10-08T10:00:00Z")).toBe(
				false,
			);
		});

		it("treats equal timestamps as not stale", () => {
			expect(isStale("2026-10-08T10:00:00Z", "2026-10-08T10:00:00Z")).toBe(
				false,
			);
		});

		it("handles invalid date strings defensively as stale", () => {
			expect(isStale("not-a-date", "2026-10-08T10:00:00Z")).toBe(true);
		});
	});

	describe("createFailedStatus", () => {
		it("captures the error message and attempt count", () => {
			const result = createFailedStatus(new Error("API down"), 3);
			expect(result.status).toBe("failed");
			expect(result.error).toBe("API down");
			expect(result.attempts).toBe(3);
		});

		it("describes non-Error throwables", () => {
			const result = createFailedStatus("quota exceeded", 2);
			expect(result.status).toBe("failed");
			expect(result.error).toBe("quota exceeded");
			expect(result.attempts).toBe(2);
		});

		it("falls back to a generic message for empty errors", () => {
			const result = createFailedStatus(undefined, 1);
			expect(result.status).toBe("failed");
			expect(result.error).toBe("Unknown translation error");
			expect(result.attempts).toBe(1);
		});
	});

	describe("describeFailure", () => {
		it("formats error with attempts for admin display", () => {
			expect(describeFailure(new Error("API down"), 3)).toBe(
				"API down (after 3 attempts)",
			);
		});

		it("uses singular wording for one attempt", () => {
			expect(describeFailure(new Error("API down"), 1)).toBe(
				"API down (after 1 attempt)",
			);
		});
	});

	describe("shouldBackfillToStale", () => {
		it("selects translated reviews whose English content is newer", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: "2026-01-02T00:00:00.000Z",
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(true);
		});

		it("skips translated reviews whose translation is current", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: "2026-01-01T00:00:00.000Z",
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(false);
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: "2026-01-01T00:00:00.000Z",
					translationUpdatedAt: "2026-01-02T00:00:00.000Z",
				}),
			).toBe(false);
		});

		it("never touches pending, failed, or untranslated reviews", () => {
			for (const translationStatus of ["pending", "failed", "untranslated"]) {
				expect(
					shouldBackfillToStale({
						translationStatus,
						englishUpdatedAt: "2026-01-02T00:00:00.000Z",
						translationUpdatedAt: "2026-01-01T00:00:00.000Z",
					}),
				).toBe(false);
			}
		});

		it("skips stale reviews already marked", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "stale",
					englishUpdatedAt: "2026-01-02T00:00:00.000Z",
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(false);
		});

		it("skips rows missing either timestamp (mirrors the SQL backfill)", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: "2026-01-02T00:00:00.000Z",
					translationUpdatedAt: null,
				}),
			).toBe(false);
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: null,
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(false);
		});

		it("skips legacy rows whose English change time was never recorded", () => {
			// The English change time is unknown for pre-existing reviews, so
			// their staleness cannot be established: they keep their status.
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: null,
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(false);
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: undefined,
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(false);
		});

		it("treats invalid dates as stale for translated reviews (isStale semantics)", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: "not-a-date",
					translationUpdatedAt: "2026-01-01T00:00:00.000Z",
				}),
			).toBe(true);
		});

		it("accepts Date instances like the hook path uses", () => {
			expect(
				shouldBackfillToStale({
					translationStatus: "translated",
					englishUpdatedAt: new Date("2026-01-02T00:00:00.000Z"),
					translationUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
				}),
			).toBe(true);
		});
	});
});
