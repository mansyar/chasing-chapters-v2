import { describe, expect, it } from "bun:test";
import {
	formatTranslationError,
	type TranslationErrorKind,
} from "@/lib/translation-errors";
import {
	type AttentionKindCounts,
	buildAttentionWhere,
	buildReviewEditURL,
	extractAttentionDocs,
	formatAttentionBadgeLabel,
	formatAttentionKindBreakdownLines,
	needsTranslationAttention,
	summarizeAttentionErrorKinds,
	TRANSLATION_ATTENTION_LIMIT,
	TRANSLATION_STUCK_PENDING_MS,
} from "../translation-attention";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const DAY_MS = TRANSLATION_STUCK_PENDING_MS;

function iso(msBeforeNow: number): string {
	return new Date(NOW.getTime() - msBeforeNow).toISOString();
}

describe("translation-attention", () => {
	describe("needsTranslationAttention", () => {
		it("flags failed and stale reviews regardless of timestamps", () => {
			for (const status of ["failed", "stale"] as const) {
				expect(
					needsTranslationAttention({
						translationStatus: status,
						documentUpdatedAt: iso(0),
						now: NOW,
					}),
				).toBe(true);
			}
		});

		it("flags a pending review older than 24 hours", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(DAY_MS + 60 * 1000),
					now: NOW,
				}),
			).toBe(true);
		});

		it("does not flag a pending review at exactly the threshold boundary", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(DAY_MS),
					now: NOW,
				}),
			).toBe(false);
		});

		it("does not flag a pending review younger than the threshold", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(DAY_MS - 1000),
					now: NOW,
				}),
			).toBe(false);
		});

		it("does not flag translated or untranslated reviews", () => {
			for (const status of ["translated", "untranslated", "anything-else"]) {
				expect(
					needsTranslationAttention({
						translationStatus: status,
						documentUpdatedAt: iso(DAY_MS * 10),
						now: NOW,
					}),
				).toBe(false);
			}
		});

		it("never flags a pending review without a usable document timestamp", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: null,
					now: NOW,
				}),
			).toBe(false);
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: "not-a-date",
					now: NOW,
				}),
			).toBe(false);
		});

		it("date-stamps pending reviews from document updatedAt only", () => {
			// translationUpdatedAt is not consulted for stuck detection: the
			// pending path never writes it.
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(0),
					now: NOW,
				}),
			).toBe(false);
		});

		it("honors a custom threshold", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(10_000),
					thresholdMs: 5000,
					now: NOW,
				}),
			).toBe(true);
			expect(
				needsTranslationAttention({
					translationStatus: "pending",
					documentUpdatedAt: iso(4000),
					thresholdMs: 5000,
					now: NOW,
				}),
			).toBe(false);
		});

		it("accepts Date instances and defaults `now` to the current time", () => {
			expect(
				needsTranslationAttention({
					translationStatus: "failed",
					documentUpdatedAt: new Date("2020-01-01T00:00:00.000Z"),
				}),
			).toBe(true);
		});

		it("rejects input without a status", () => {
			expect(needsTranslationAttention({})).toBe(false);
			expect(
				needsTranslationAttention({
					translationStatus: null,
					documentUpdatedAt: iso(DAY_MS * 5),
					now: NOW,
				}),
			).toBe(false);
		});
	});

	describe("buildAttentionWhere", () => {
		it("ors failed, stale, and pre-cutoff pending together", () => {
			expect(buildAttentionWhere(NOW)).toEqual({
				or: [
					{ translationStatus: { equals: "failed" } },
					{ translationStatus: { equals: "stale" } },
					{
						and: [
							{ translationStatus: { equals: "pending" } },
							{
								updatedAt: {
									less_than: "2026-10-20T12:00:00.000Z",
								},
							},
						],
					},
				],
			});
		});

		it("accepts a string `now`", () => {
			expect(buildAttentionWhere("2026-10-21T00:00:00.000Z")).toEqual({
				or: [
					{ translationStatus: { equals: "failed" } },
					{ translationStatus: { equals: "stale" } },
					{
						and: [
							{ translationStatus: { equals: "pending" } },
							{
								updatedAt: {
									less_than: "2026-10-20T00:00:00.000Z",
								},
							},
						],
					},
				],
			});
		});

		it("reflects a custom threshold in the pending cutoff", () => {
			const result = buildAttentionWhere(NOW, 60 * 60 * 1000);
			const or = result.or;
			expect(Array.isArray(or)).toBe(true);
			const pending = (or as Array<Record<string, unknown>>)[2] as {
				and?: Array<Record<string, unknown>>;
			};
			const updatedAt = pending.and?.[1]?.updatedAt as {
				less_than?: string;
			};
			expect(updatedAt.less_than).toBe("2026-10-21T11:00:00.000Z");
		});
	});

	describe("buildReviewEditURL", () => {
		it("links to the admin edit view for the review", () => {
			expect(buildReviewEditURL(42)).toBe("/admin/collections/reviews/42");
			expect(buildReviewEditURL("42")).toBe("/admin/collections/reviews/42");
		});
	});

	describe("formatAttentionBadgeLabel", () => {
		it("shows the exact count below the list limit", () => {
			expect(formatAttentionBadgeLabel(0)).toBe("0");
			expect(formatAttentionBadgeLabel(1)).toBe("1");
			expect(formatAttentionBadgeLabel(TRANSLATION_ATTENTION_LIMIT)).toBe(
				String(TRANSLATION_ATTENTION_LIMIT),
			);
		});

		it("marks a truncated list with a plus suffix", () => {
			expect(formatAttentionBadgeLabel(TRANSLATION_ATTENTION_LIMIT + 1)).toBe(
				`${TRANSLATION_ATTENTION_LIMIT}+`,
			);
			expect(formatAttentionBadgeLabel(57)).toBe(
				`${TRANSLATION_ATTENTION_LIMIT}+`,
			);
		});

		it("honors a custom limit", () => {
			expect(formatAttentionBadgeLabel(5, 3)).toBe("3+");
			expect(formatAttentionBadgeLabel(3, 3)).toBe("3");
		});
	});

	describe("extractAttentionDocs", () => {
		const freshPending = {
			id: 1,
			title: "Fresh pending",
			translationStatus: "pending",
			updatedAt: iso(1000),
		};
		const stuckPending = {
			id: 2,
			title: "Stuck pending",
			translationStatus: "pending",
			updatedAt: iso(DAY_MS + 5000),
		};
		const failed = {
			id: 3,
			title: "Failure",
			translationStatus: "failed",
			updatedAt: iso(1000),
		};
		const stale = {
			id: 4,
			title: "Stale",
			translationStatus: "stale",
			updatedAt: iso(1000),
		};
		const translated = {
			id: 5,
			title: "Done",
			translationStatus: "translated",
			updatedAt: iso(1000),
		};

		it("keeps failed, stale, and stuck-pending docs and drops the rest", () => {
			expect(extractAttentionDocs([], NOW)).toEqual([]);
			const docs = [freshPending, stuckPending, failed, stale, translated];
			expect(extractAttentionDocs(docs, NOW).map((item) => item.id)).toEqual([
				"2",
				"3",
				"4",
			]);
		});

		it("maps each entry to id, title, status, error, and edit URL", () => {
			const [failure] = extractAttentionDocs([failed], NOW);
			expect(failure).toEqual({
				id: "3",
				title: "Failure",
				translationStatus: "failed",
				editURL: "/admin/collections/reviews/3",
				translationError: null,
				errorKind: null,
			});
		});

		it("falls back to a generated title when the doc has none", () => {
			const [item] = extractAttentionDocs(
				[{ id: 7, translationStatus: "failed", updatedAt: iso(1000) }],
				NOW,
			);
			expect(item.title).toBe("Review 7");
		});

		it("drops docs without an id or status and non-object entries", () => {
			const docs = [
				{ id: 8, translationStatus: "failed", updatedAt: iso(1000) },
				{ title: "no status", updatedAt: iso(1000) },
				{ translationStatus: "failed", updatedAt: iso(1000) },
				"not-a-doc",
				null,
			];
			expect(extractAttentionDocs(docs, NOW)).toHaveLength(1);
			expect(extractAttentionDocs(docs, NOW)[0].id).toBe("8");
		});

		it("respects the shared threshold by default", () => {
			// Sanity check the stubs themselves against the predicate.
			const attention = [
				...extractAttentionDocs([stuckPending], NOW),
				...extractAttentionDocs([freshPending], NOW),
			];
			expect(attention).toHaveLength(1);
			expect(attention[0].id).toBe("2");
		});

		it("caps nothing by itself; the REST limit stays with the caller", () => {
			const many = Array.from(
				{ length: TRANSLATION_ATTENTION_LIMIT * 2 },
				(_, index) => ({ ...stale, id: 100 + index }),
			);
			// The helper maps without truncation so the caller controls the bound.
			expect(extractAttentionDocs(many, NOW)).toHaveLength(
				TRANSLATION_ATTENTION_LIMIT * 2,
			);
		});
	});

	describe("summarizeAttentionErrorKinds", () => {
		/** A `failed` doc whose stored error is what the pipeline actually writes. */
		function failedDoc(id: number, error: unknown) {
			return {
				id,
				title: `Failure ${id}`,
				translationStatus: "failed",
				updatedAt: iso(1000),
				translationError: formatTranslationError(error),
			};
		}

		it("separates quota failures from network, timeout, credentials and unexpected failures", () => {
			// The stored string round-trips through the classifier, so this also
			// proves the persisted format is enough to recover the kind.
			const docs = [
				failedDoc(1, new Error("quota exceeded")),
				failedDoc(2, new Error("ECONNRESET")),
				failedDoc(3, new Error("timed out")),
				failedDoc(4, new Error("401 Unauthorized")),
				failedDoc(5, new Error("boom")),
				failedDoc(6, new Error("boom")),
			];
			expect(
				summarizeAttentionErrorKinds(extractAttentionDocs(docs, NOW)),
			).toEqual({
				quota: 1,
				network: 1,
				timeout: 1,
				credentials: 1,
				unexpected: 2,
			});
		});

		it("counts zero for every kind absent from the fetched page", () => {
			const counts = summarizeAttentionErrorKinds(
				extractAttentionDocs([failedDoc(1, new Error("quota exceeded"))], NOW),
			);
			expect(counts).toEqual({
				quota: 1,
				network: 0,
				timeout: 0,
				credentials: 0,
				unexpected: 0,
			});
		});

		it("leaves rows without a stored failure message out of every kind", () => {
			// A `stale` review and a `failed` review with a blank message are not
			// "unexpected failures" — they simply carry no kind.
			const docs = [
				{ id: 1, translationStatus: "stale", updatedAt: iso(1000) },
				{
					id: 2,
					translationStatus: "failed",
					updatedAt: iso(1000),
					translationError: "   ",
				},
			];
			const items = extractAttentionDocs(docs, NOW);
			expect(items.map((item) => item.errorKind)).toEqual([null, null]);
			expect(summarizeAttentionErrorKinds(items)).toEqual({
				quota: 0,
				network: 0,
				timeout: 0,
				credentials: 0,
				unexpected: 0,
			});
		});

		it("falls back to unexpected for an unclassifiable stored message", () => {
			const items = extractAttentionDocs(
				[
					{
						id: 9,
						translationStatus: "failed",
						updatedAt: iso(1000),
						translationError: "the provider said something we have never seen",
					},
				],
				NOW,
			);
			expect(items[0].errorKind).toBe("unexpected");
			expect(() => summarizeAttentionErrorKinds(items)).not.toThrow();
		});

		it("keeps the stored message on the item for the operator", () => {
			const stored = formatTranslationError(new Error("quota exceeded"));
			const [item] = extractAttentionDocs(
				[
					{
						id: 4,
						translationStatus: "failed",
						updatedAt: iso(1000),
						translationError: stored,
					},
				],
				NOW,
			);
			expect(item.translationError).toBe(stored);
			expect(item.errorKind).toBe("quota");
		});

		it("round-trips every kind through the stored message", () => {
			// The stored string is "<actionable message> (raw: <detail>)". Feeding
			// it back to the classifier must land on the same kind, otherwise the
			// bell would report a different cause than the pipeline recorded.
			const cases: Array<[Error, TranslationErrorKind]> = [
				[new Error("quota exceeded"), "quota"],
				[new Error("ECONNRESET"), "network"],
				[new Error("timed out"), "timeout"],
				[new Error("401 Unauthorized"), "credentials"],
				[new Error("boom"), "unexpected"],
			];
			for (const [error, expected] of cases) {
				const stored = formatTranslationError(error);
				const [item] = extractAttentionDocs(
					[
						{
							id: 1,
							translationStatus: "failed",
							updatedAt: iso(1000),
							translationError: stored,
						},
					],
					NOW,
				);
				expect(item.errorKind).toBe(expected);
			}
		});

		it("tolerates a non-string translationError", () => {
			const [item] = extractAttentionDocs(
				[
					{
						id: 5,
						translationStatus: "failed",
						updatedAt: iso(1000),
						translationError: { nested: true },
					},
				],
				NOW,
			);
			expect(item.translationError).toBeNull();
			expect(item.errorKind).toBeNull();
		});
	});

	describe("formatAttentionKindBreakdownLines", () => {
		const only = (
			overrides: Partial<AttentionKindCounts>,
		): AttentionKindCounts => ({
			quota: 0,
			network: 0,
			timeout: 0,
			credentials: 0,
			unexpected: 0,
			...overrides,
		});

		it("names the sample and the true backlog when the page is truncated", () => {
			expect(
				formatAttentionKindBreakdownLines(
					only({ quota: 3, network: 1 }),
					20,
					47,
				),
			).toEqual([
				"Failure kinds across the 20 reviews shown, not the whole backlog of 47:",
				"3 quota",
				"1 network",
			]);
		});

		it("gives each present kind its own line, in canonical order", () => {
			// quota first, and each kind distinguishable from the others.
			expect(
				formatAttentionKindBreakdownLines(
					only({ quota: 2, timeout: 1, unexpected: 4, credentials: 1 }),
					8,
				),
			).toEqual([
				"Failure kinds across the 8 reviews shown:",
				"2 quota",
				"1 timeout",
				"1 credentials",
				"4 unexpected",
			]);
		});

		it("drops the backlog clause when the page is the whole backlog", () => {
			expect(
				formatAttentionKindBreakdownLines(only({ quota: 2 }), 2, 2),
			).toEqual(["Failure kinds across the 2 reviews shown:", "2 quota"]);
		});

		it("uses the singular for a one-row page", () => {
			expect(formatAttentionKindBreakdownLines(only({ quota: 1 }), 1)).toEqual([
				"Failure kinds across the 1 review shown:",
				"1 quota",
			]);
		});

		it("reports none recorded when no row carries a kind", () => {
			expect(formatAttentionKindBreakdownLines(only({}), 1, 3)).toEqual([
				"Failure kinds across the 1 review shown, not the whole backlog of 3:",
				"none recorded",
			]);
		});

		it("renders nothing for an empty page", () => {
			expect(formatAttentionKindBreakdownLines(only({}), 0, 5)).toEqual([]);
		});
	});
});
