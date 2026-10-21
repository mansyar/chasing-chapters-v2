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

export const TRANSLATION_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
