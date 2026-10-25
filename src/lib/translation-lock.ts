// Per-review translation pipeline lock.
//
// Prevents two concurrent translation pipelines from running for the same
// review (e.g. two rapid saves each firing the afterChange hook). The lock
// is Redis-backed when REDIS_URL is configured and falls back to an
// in-process Map otherwise (matching how the translation cache degrades).
// A second trigger while the lock is held is a silent no-op for the
// caller: acquire returns null and the pipeline logs and returns.
//
// Race safety:
// - Redis: SET key token NX PX <ttl> only succeeds for one holder; release
//   uses a compare-and-delete Lua script so an expired lock re-acquired by
//   another owner is never deleted by the previous owner.
// - In-memory: single-threaded event loop makes check-and-set atomic;
//   expiry makes a crashed holder's lock self-healing.

import { getRedisClient } from "./redis";
import {
	MAX_ATTEMPTS,
	RETRY_DELAYS_MS,
	TRANSLATION_REQUEST_TIMEOUT_MS,
} from "./translate";
import { TRANSLATION_BUDGET_WINDOW_MS } from "./translation-budget";

/**
 * Translation steps one pipeline run performs, in sequence.
 *
 * `runTranslationPipeline` translates four localized rich-text fields
 * (`reviewContent`, `whatILoved`, `whatCouldBeBetter`, `perfectFor`) and then
 * the favorite-quote list in one batched call — five sequential
 * `translateBatch` calls, so a run's duration is a multiple of one step's, not
 * one step's.
 *
 * One step is assumed to be one provider chunk, i.e. one request of at most
 * `TRANSLATION_BATCH_CHAR_CAP` code points. That is the packer's per-request
 * ceiling, so it holds for any single field up to that many code points. The
 * quote step is one `translateBatch` call but not necessarily one chunk:
 * `favoriteQuotes` has no `maxRows`, so a long enough quote list is packed into
 * several requests exactly as an over-cap field is. The invariant the count
 * assumes is therefore about *content*, not call shape: the TTL bounds a run of
 * at most five chunks, i.e. when the four rich-text fields plus the quote list
 * total no more than `TRANSLATION_BATCH_CHAR_CAP` code points. A review whose
 * text exceeds that in any field, or whose quote list does, issues further
 * chunks and outlives this bound — none of them carry a maximum length, so no
 * finite TTL can bound that case. The count is stated here rather than
 * multiplied in the TTL expression so the assumption is one auditable number.
 */
export const TRANSLATION_PIPELINE_STEPS = 5;

/**
 * Backoff the retry loop actually sleeps across one step (ms).
 *
 * `translateChunkWithRetry` sleeps only *between* attempts
 * (`attempt < MAX_ATTEMPTS - 1`), so the schedule's last delay is never
 * waited on: three attempts carry two backoffs.
 */
const TRANSLATION_RETRY_BACKOFF_MS = RETRY_DELAYS_MS.slice(
	0,
	MAX_ATTEMPTS - 1,
).reduce((total, delay) => total + delay, 0);

/**
 * Worst-case duration of one translation step (ms): one `translateBatch`
 * call, retried by `translateChunkWithRetry` up to `MAX_ATTEMPTS` times.
 *
 * Per attempt: the bounded wait for the rolling character budget — up to one
 * full `TRANSLATION_BUDGET_WINDOW_MS`, which `reserveCharacters` bounds a
 * reservation's wait by — plus the request timeout. Between attempts: the
 * backoff above.
 */
export const TRANSLATION_WORST_CASE_STEP_MS =
	MAX_ATTEMPTS *
		(TRANSLATION_BUDGET_WINDOW_MS + TRANSLATION_REQUEST_TIMEOUT_MS) +
	TRANSLATION_RETRY_BACKOFF_MS;

/**
 * How long a lock lives before it expires on its own (ms).
 *
 * Derived, never hardcoded: a fixed value silently drifts from the retry
 * policy it is supposed to outlive, and a lock that expires mid-run lets a
 * second run start on the same review — the double-run the lock exists to
 * prevent. With today's constants one step is 3 × (100s + 30s) + 10s = 400s
 * and a run is five steps, so the TTL is 2,000s (33m20s) against the 10
 * minutes this used to be.
 *
 * The tradeoff: this errs long. A crashed run blocks retranslation for the
 * whole TTL, but a short TTL would silently allow the concurrent run, which
 * is the failure that corrupts data; a stale lock only delays a retry. No
 * renewal heartbeat — it is more machinery than the requirement asks for.
 */
export const TRANSLATION_LOCK_TTL_MS =
	TRANSLATION_PIPELINE_STEPS * TRANSLATION_WORST_CASE_STEP_MS;

export function translationLockKey(reviewId: number | string): string {
	return `translate-lock:${reviewId}`;
}

interface MemoryLock {
	token: string;
	expiresAt: number;
}

// In-memory fallback when Redis is unavailable (getRedisClient() returns null).
const memoryLocks = new Map<string, MemoryLock>();

const RELEASE_SCRIPT =
	'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

function randomToken(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Try to acquire the translation lock for a review.
 * Returns the holder token on success, or null when another pipeline
 * already holds the lock (the caller should log and no-op).
 */
export async function acquireTranslationLock(
	reviewId: number | string,
	ttlMs: number = TRANSLATION_LOCK_TTL_MS,
): Promise<string | null> {
	const key = translationLockKey(reviewId);
	const client = getRedisClient();

	if (client) {
		try {
			const token = randomToken();
			const result = await client.set(key, token, "PX", ttlMs, "NX");
			return result === "OK" ? token : null;
		} catch (error) {
			// Redis errors must not block translation: fall back to memory.
			console.error("[TranslationLock] Redis acquire failed:", error);
		}
	}

	return acquireMemoryLock(key, ttlMs);
}

/**
 * Whether a translation pipeline currently holds the lock for a review.
 *
 * The bulk re-translate action uses this to skip reviews that are already
 * being translated (the pipeline itself would no-op) instead of reporting a
 * misleading failure. Checks the Redis lock first and falls back to the
 * in-memory map, so both backends are covered.
 */
export async function isTranslationLocked(
	reviewId: number | string,
): Promise<boolean> {
	const key = translationLockKey(reviewId);
	const client = getRedisClient();

	if (client) {
		try {
			const token = await client.get(key);
			if (token !== null) return true;
		} catch (error) {
			// Redis errors must not block the caller: fall back to memory.
			console.error("[TranslationLock] Redis check failed:", error);
		}
	}

	const existing = memoryLocks.get(key);
	return Boolean(existing && existing.expiresAt > Date.now());
}

/**
 * Release the translation lock for a review. The token must be the one
 * returned by acquire so a lock re-acquired by another owner after expiry
 * is never deleted by the previous holder.
 */
export async function releaseTranslationLock(
	reviewId: number | string,
	token: string,
): Promise<void> {
	const key = translationLockKey(reviewId);
	const client = getRedisClient();

	if (client) {
		try {
			// Compare-and-delete: only free the lock when we still own it.
			await client.eval(RELEASE_SCRIPT, 1, key, token);
		} catch (error) {
			console.error("[TranslationLock] Redis release failed:", error);
		}
	}

	// Always clear the in-memory entry too: no-op unless this run acquired
	// via the fallback path after a Redis error.
	releaseMemoryLock(key, token);
}

function acquireMemoryLock(key: string, ttlMs: number): string | null {
	const existing = memoryLocks.get(key);
	if (existing && existing.expiresAt > Date.now()) {
		return null;
	}
	const token = randomToken();
	memoryLocks.set(key, {
		token,
		expiresAt: Date.now() + ttlMs,
	});
	return token;
}

function releaseMemoryLock(key: string, token: string): void {
	const existing = memoryLocks.get(key);
	if (!existing || existing.token !== token) return;
	memoryLocks.delete(key);
}

/** Test helper: clear the in-memory fallback locks between tests. */
export function clearTranslationLocksForTest(): void {
	memoryLocks.clear();
}
