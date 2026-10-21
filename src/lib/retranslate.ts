import type { Payload, TypedUser } from "payload";
import { runTranslationPipeline } from "../hooks/translateReview";
import type { Review } from "../payload-types";
import { isTranslationLocked } from "./translation-lock";

/** Outcome of the admin "Re-translate now" action. */
export interface RetranslateResult {
	ok: boolean;
	httpStatus: 200 | 401 | 403 | 404;
	/** Final translation status after the pipeline ran (when ok). */
	translationStatus?: string | null;
	/** Failure details when the translation pipeline marked the review failed. */
	error?: string;
}

type RetranslateUser = { id: number; role: string } | null | undefined;

/** Options for one re-translate run. */
export interface RetranslateOptions {
	/**
	 * Epoch-ms deadline for the pipeline run. When it is reached the run
	 * stops translating and the review is marked failed with the budget
	 * reason — the request that triggered it answers within its own budget.
	 */
	deadline?: number;
}

/**
 * Admin "Re-translate now" core: authorization, then a full translation
 * pipeline run for any review regardless of draft/published state. This is an
 * explicit user action, so the per-review autoTranslate toggle is overridden.
 */
export async function retranslateReview(
	payload: Payload,
	user: RetranslateUser,
	id: number,
	options: RetranslateOptions = {},
): Promise<RetranslateResult> {
	if (!user) {
		return { ok: false, httpStatus: 401, error: "Authentication required" };
	}

	let doc: Review;
	try {
		doc = await payload.findByID({ collection: "reviews", id, depth: 0 });
	} catch {
		return { ok: false, httpStatus: 404, error: "Review not found" };
	}

	// Admin may re-translate anything; writers only their own reviews.
	const authorId =
		typeof doc.author === "object" && doc.author !== null
			? doc.author.id
			: doc.author;
	const isAuthor = authorId === user.id;
	if (user.role !== "admin" && !isAuthor) {
		return { ok: false, httpStatus: 403, error: "Not authorized" };
	}

	// Explicit action: ignore the autoTranslate toggle entirely.
	await runTranslationPipeline(payload, doc, { deadline: options.deadline });

	const updated = await payload.findByID({
		collection: "reviews",
		id,
		depth: 0,
	});

	const result: RetranslateResult = {
		ok: true,
		httpStatus: 200,
		translationStatus: updated.translationStatus,
	};
	if (updated.translationError) {
		result.error = updated.translationError;
	}
	return result;
}

// ---------------------------------------------------------------------------
// Bulk re-translate (FR-4)
// ---------------------------------------------------------------------------

/** Maximum number of reviews one bulk re-translate request may cover. */
export const BULK_RETRANSLATE_MAX_IDS = 50;

/**
 * Wall-clock budget for one bulk re-translate request. The endpoint runs
 * behind a proxy with a 60s read timeout, so the batch stops well before that
 * and reports the reviews it did not attempt.
 *
 * The budget bounds the whole request, not only the loop: the review that is
 * in flight when the budget runs out is aborted at the same deadline, so one
 * slow review cannot push the response past the proxy timeout.
 */
export const BULK_RETRANSLATE_TIME_BUDGET_MS = 30 * 1000;

/** Why a review was not attempted: the batch ran out of time. */
export const BULK_RETRANSLATE_BUDGET_REASON =
	"not attempted — batch time budget reached";

/** Translation statuses the bulk re-translate action acts on. */
export const BULK_RETRANSLATABLE_STATUSES = ["failed", "stale"] as const;

/** Outcome of one review inside a bulk re-translate run. */
export type BulkRetranslateOutcomeStatus = "translated" | "failed" | "skipped";

export interface BulkRetranslateOutcome {
	/** The review the outcome belongs to. */
	id: number;
	status: BulkRetranslateOutcomeStatus;
	/** Why the review was skipped, or the failure detail. */
	reason?: string;
	/** The review's translation status after the attempt. */
	translationStatus?: string | null;
}

/**
 * Whether a review's translation status qualifies for a bulk re-translate:
 * only `failed` and `stale` reviews need a new translation.
 */
export function isBulkRetranslatableStatus(
	status: string | null | undefined,
): boolean {
	return (BULK_RETRANSLATABLE_STATUSES as readonly string[]).includes(
		status ?? "",
	);
}

/**
 * Validate the review ids of a bulk re-translate request: an array of
 * positive integer ids, at most BULK_RETRANSLATE_MAX_IDS of them,
 * deduplicated. Returns the clean id list or a message describing why the
 * request is invalid.
 */
export function normalizeBulkRetranslateIds(input: unknown): {
	ids: number[];
	error: string | null;
} {
	if (!Array.isArray(input)) {
		return { ids: [], error: "Expected an array of review ids" };
	}
	if (input.length === 0) {
		return { ids: [], error: "No review ids provided" };
	}
	if (input.length > BULK_RETRANSLATE_MAX_IDS) {
		return {
			ids: [],
			error: `At most ${BULK_RETRANSLATE_MAX_IDS} reviews can be re-translated at once`,
		};
	}

	const ids: number[] = [];
	const seen = new Set<number>();
	for (const raw of input) {
		const id = toReviewId(raw);
		if (id === null) {
			return { ids: [], error: `Invalid review id: ${String(raw)}` };
		}
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return { ids, error: null };
}

function toReviewId(raw: unknown): number | null {
	const value =
		typeof raw === "number"
			? raw
			: typeof raw === "string" && /^\d+$/.test(raw.trim())
				? Number(raw.trim())
				: Number.NaN;
	if (!Number.isInteger(value) || value <= 0) return null;
	return value;
}

/** Options for one bulk re-translate run. */
export interface BulkRetranslateOptions {
	/**
	 * Wall-clock budget for the whole batch (ms). Defaults to
	 * BULK_RETRANSLATE_TIME_BUDGET_MS; injectable for tests.
	 */
	timeBudgetMs?: number | undefined;
	/** Clock source, injectable for tests. Defaults to `Date.now`. */
	now?: (() => number) | undefined;
}

/**
 * Re-translate a selection of reviews, one after the other.
 *
 * The runs are sequential on purpose: the translation provider is rate
 * limited, so a burst of parallel pipelines would fail. Every review is
 * reported individually — unauthorized targets and reviews that do not need a
 * re-translate are skipped, a failing review is reported as failed, and
 * neither aborts the rest of the batch.
 *
 * The batch is bounded by a wall-clock budget. Once the budget is exhausted
 * the remaining reviews are reported as skipped instead of being attempted,
 * and the review that was in flight is aborted at the same deadline — so the
 * request answers with one outcome per selected review, within the budget
 * plus a small overhead, and the proxy timeout cannot cut the response off.
 */
export async function retranslateReviews(
	payload: Payload,
	user: TypedUser | null,
	ids: readonly number[],
	options: BulkRetranslateOptions = {},
): Promise<BulkRetranslateOutcome[]> {
	const budgetMs = options.timeBudgetMs ?? BULK_RETRANSLATE_TIME_BUDGET_MS;
	const clock = options.now ?? Date.now;
	const deadline = clock() + budgetMs;
	const outcomes: BulkRetranslateOutcome[] = [];
	for (const id of ids) {
		if (clock() >= deadline) {
			outcomes.push({
				id,
				status: "skipped",
				reason: BULK_RETRANSLATE_BUDGET_REASON,
			});
			continue;
		}
		// The in-flight review shares the batch deadline: it is aborted when
		// the budget runs out instead of running past it.
		outcomes.push(
			await retranslateOneReview(payload, user, id, {
				deadline,
			}),
		);
	}
	return outcomes;
}

async function retranslateOneReview(
	payload: Payload,
	user: TypedUser | null,
	id: number,
	options: RetranslateOptions = {},
): Promise<BulkRetranslateOutcome> {
	if (!user) {
		return { id, status: "skipped", reason: "Authentication required" };
	}

	let doc: Review;
	try {
		// Access rules apply: a writer only reaches their own reviews, an
		// admin reaches all of them.
		doc = await payload.findByID({
			collection: "reviews",
			id,
			depth: 0,
			overrideAccess: false,
			user,
		});
	} catch (error) {
		if (isNotFoundError(error)) {
			return {
				id,
				status: "skipped",
				reason: "Review not found or not accessible",
			};
		}
		return { id, status: "failed", reason: describeError(error) };
	}

	if (!isBulkRetranslatableStatus(doc.translationStatus)) {
		return {
			id,
			status: "skipped",
			reason: `Translation status is "${doc.translationStatus ?? "unknown"}" (only failed or stale reviews are re-translated)`,
		};
	}

	// A pipeline already running for this review is a no-op; report it as
	// skipped instead of a misleading failure.
	if (await isTranslationLocked(id)) {
		return {
			id,
			status: "skipped",
			reason: "A translation run is already in progress for this review",
		};
	}

	try {
		const result = await retranslateReview(payload, user, id, options);
		if (!result.ok) {
			return {
				id,
				status: "skipped",
				reason: result.error ?? "Review could not be re-translated",
				translationStatus: result.translationStatus ?? null,
			};
		}
		if (result.translationStatus === "translated") {
			return { id, status: "translated", translationStatus: "translated" };
		}
		if (result.translationStatus === "failed") {
			return {
				id,
				status: "failed",
				reason: result.error ?? "Translation failed",
				translationStatus: "failed",
			};
		}
		return {
			id,
			status: "skipped",
			reason: `Translation status is "${result.translationStatus ?? "unknown"}"`,
			translationStatus: result.translationStatus ?? null,
		};
	} catch (error) {
		return { id, status: "failed", reason: describeError(error) };
	}
}

function isNotFoundError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const candidate = error as { status?: unknown; name?: unknown };
	return candidate.status === 404 || candidate.name === "NotFound";
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
