import { describe, expect, it } from "bun:test";
import {
	buildTranslationStatusPatch,
	resolveTranslationTransition,
	shouldPollTranslationStatus,
	TOAST_MAX_LENGTH,
	TRANSLATION_POLL_ACTIVITY_WINDOW_MS,
	truncateToastMessage,
} from "../translation-poll";

const LONG_ERROR = `${"x".repeat(TOAST_MAX_LENGTH)}raw detail tail`;
// Author-actionable first (from source), raw detail after.

describe("translation-poll", () => {
	describe("truncateToastMessage", () => {
		it("returns an empty string for missing or blank messages", () => {
			expect(truncateToastMessage(null)).toBe("");
			expect(truncateToastMessage(undefined)).toBe("");
			expect(truncateToastMessage("")).toBe("");
			expect(truncateToastMessage("   ")).toBe("");
		});

		it("leaves short messages untouched", () => {
			expect(truncateToastMessage("Translation quota exceeded")).toBe(
				"Translation quota exceeded",
			);
		});

		it("keeps a message that exactly fits", () => {
			const exact = "a".repeat(TOAST_MAX_LENGTH);
			expect(truncateToastMessage(exact)).toBe(exact);
		});

		it("trims long messages to maxLength including the ellipsis", () => {
			const truncated = truncateToastMessage(LONG_ERROR);
			expect(truncated).toHaveLength(TOAST_MAX_LENGTH);
			expect(truncated.endsWith("…")).toBe(true);
			expect(truncated).toBe(`${"x".repeat(TOAST_MAX_LENGTH - 1)}…`);
		});

		it("honors a custom maxLength", () => {
			const truncated = truncateToastMessage("abcdefghij", 5);
			expect(truncated).toHaveLength(5);
			expect(truncated.startsWith("abcd")).toBe(true);
		});
	});

	describe("buildTranslationStatusPatch", () => {
		it("always patches translationStatus as a clean (unmodified) entry", () => {
			const patch = buildTranslationStatusPatch("translated");
			expect(patch.translationStatus).toEqual({
				value: "translated",
				initialValue: "translated",
				valid: true,
			});
			expect(patch.translationError?.value).toBe("");
		});

		it("patches translationError with the stored message on failed", () => {
			const patch = buildTranslationStatusPatch("failed", {
				translationError: "Quota exceeded. Wait before retrying. (raw: 429)",
			});
			expect(patch.translationError?.value).toBe(
				"Quota exceeded. Wait before retrying. (raw: 429)",
			);
		});

		it("falls back to an empty error message on failed without one", () => {
			const patch = buildTranslationStatusPatch("failed");
			expect(patch.translationError?.value).toBe("");
		});

		it("clears translationError on translated", () => {
			const patch = buildTranslationStatusPatch("translated", {
				translationError: "old failure",
			});
			expect(patch.translationError?.value).toBe("");
		});

		it("patches translationUpdatedAt when present", () => {
			const patch = buildTranslationStatusPatch("failed", {
				translationUpdatedAt: "2026-10-21T10:00:00.000Z",
			});
			expect(patch.translationUpdatedAt).toEqual({
				value: "2026-10-21T10:00:00.000Z",
				initialValue: "2026-10-21T10:00:00.000Z",
				valid: true,
			});
		});

		it("omits translationUpdatedAt when the doc has none", () => {
			const patch = buildTranslationStatusPatch("stale");
			expect(patch.translationUpdatedAt).toBeUndefined();
			expect(patch.translationError).toBeUndefined();
		});

		it("produces fully valid entries for every status", () => {
			for (const status of [
				"untranslated",
				"pending",
				"translated",
				"failed",
				"stale",
			]) {
				const patch = buildTranslationStatusPatch(status);
				for (const key of [
					"translationStatus",
					"translationError",
					"translationUpdatedAt",
				] as const) {
					const entry = patch[key];
					if (!entry) continue;
					expect(entry.valid).toBe(true);
					expect(entry.initialValue).toBe(entry.value);
				}
			}
		});
	});

	describe("resolveTranslationTransition", () => {
		it("announces success when pending becomes translated", () => {
			const result = resolveTranslationTransition({
				lastSeenStatus: "pending",
				nextDoc: {
					translationStatus: "translated",
					translationUpdatedAt: "2026-10-21T10:00:00.000Z",
				},
			});
			expect(result?.toast).toEqual({
				kind: "success",
				message: "Translation completed",
			});
			expect(result?.patch.translationStatus.value).toBe("translated");
			expect(result?.patch.translationError?.value).toBe("");
			expect(result?.patch.translationUpdatedAt?.value).toBe(
				"2026-10-21T10:00:00.000Z",
			);
		});

		it("announces failure with the truncated actionable error", () => {
			const result = resolveTranslationTransition({
				lastSeenStatus: "pending",
				nextDoc: {
					translationStatus: "failed",
					translationError: LONG_ERROR,
				},
			});
			expect(result?.toast).toEqual({
				kind: "error",
				message: `${"x".repeat(TOAST_MAX_LENGTH - 1)}…`,
			});
			expect(result?.patch.translationStatus.value).toBe("failed");
		});

		it("uses a fallback message for failures without a stored error", () => {
			const result = resolveTranslationTransition({
				lastSeenStatus: "pending",
				nextDoc: { translationStatus: "failed" },
			});
			expect(result?.toast).toEqual({
				kind: "error",
				message: "Translation failed",
			});
		});

		it("stays silent for unknown first observations", () => {
			expect(
				resolveTranslationTransition({
					lastSeenStatus: undefined,
					nextDoc: { translationStatus: "translated" },
				}),
			).toBeNull();
			expect(
				resolveTranslationTransition({
					lastSeenStatus: null,
					nextDoc: { translationStatus: "failed" },
				}),
			).toBeNull();
		});

		it("does nothing when the status did not change", () => {
			expect(
				resolveTranslationTransition({
					lastSeenStatus: "pending",
					nextDoc: {
						translationStatus: "pending",
						translationError: "ignored",
					},
				}),
			).toBeNull();
			expect(
				resolveTranslationTransition({
					lastSeenStatus: "translated",
					nextDoc: { translationStatus: "translated" },
				}),
			).toBeNull();
		});

		it("rejects snapshots without a status", () => {
			expect(
				resolveTranslationTransition({
					lastSeenStatus: "pending",
					nextDoc: {
						translationStatus: "",
						translationError: "ignored",
					},
				}),
			).toBeNull();
		});

		it("updates the visible fields silently for a non-terminal transition", () => {
			const result = resolveTranslationTransition({
				lastSeenStatus: "translated",
				nextDoc: { translationStatus: "stale" },
			});
			expect(result?.toast).toBeNull();
			expect(result?.patch.translationStatus.value).toBe("stale");
			expect(result?.patch.translationError).toBeUndefined();
		});
	});

	describe("shouldPollTranslationStatus", () => {
		const NOW = new Date("2026-10-22T12:00:00.000Z");
		const justModified = new Date(NOW.getTime() - 60 * 1000).toISOString();
		const longIdle = new Date(
			NOW.getTime() - TRANSLATION_POLL_ACTIVITY_WINDOW_MS - 60 * 1000,
		).toISOString();

		it("polls while the visible status is pending", () => {
			expect(
				shouldPollTranslationStatus({
					shownStatus: "pending",
					documentUpdatedAt: longIdle,
					now: NOW,
				}),
			).toBe(true);
		});

		it("polls a just-saved document whose status is not pending yet", () => {
			// The pipeline marks the review pending asynchronously, so right
			// after a save the form still shows the pre-pipeline status.
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: justModified,
					now: NOW,
				}),
			).toBe(true);
		});

		it("does not poll a long-idle document", () => {
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: longIdle,
					now: NOW,
				}),
			).toBe(false);
		});

		it("falls back to the status rule without a usable timestamp", () => {
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: null,
					now: NOW,
				}),
			).toBe(false);
			expect(
				shouldPollTranslationStatus({
					shownStatus: "pending",
					documentUpdatedAt: null,
					now: NOW,
				}),
			).toBe(true);
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: "not-a-date",
					now: NOW,
				}),
			).toBe(false);
		});

		it("honors a custom window", () => {
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: justModified,
					now: NOW,
					windowMs: 1000,
				}),
			).toBe(false);
		});

		it("accepts epoch milliseconds and Date instances", () => {
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: NOW.getTime() - 1000,
					now: NOW,
				}),
			).toBe(true);
			expect(
				shouldPollTranslationStatus({
					shownStatus: "translated",
					documentUpdatedAt: new Date(NOW.getTime() - 1000),
					now: NOW.getTime(),
				}),
			).toBe(true);
		});
	});
});
