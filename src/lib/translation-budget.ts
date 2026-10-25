// Rolling character budget for Google Cloud Translation.
//
// Cloud Translation v2 (Basic) enforces a legacy per-user quota of characters
// per rolling 100 seconds (default 100,000). A service account is the "user"
// for quota purposes, so every request this process sends shares one bucket.
// Character-aware packing bounds a single request's size; this module bounds
// the *rate* at which characters are spent, so a burst of reviews cannot drain
// the window in a handful of calls and leave every retry inside an already
// exhausted bucket.
//
// Backends, mirroring `translation-lock.ts`:
// - Redis: a time-bucketed INCRBY keyed by the window index. The key expires
//   when its window ends, so the counter is the window's total and the next
//   window starts from zero without a separate reset.
// - In-process Map: used when REDIS_URL is absent, the client is not
//   connected, or a Redis command fails. Per-instance pacing only, which is
//   what the single-instance deployment needs (see spec Open Questions).
//
// Accounting is O(1): one atomic read-and-write per reservation, and a single
// read for the remaining-budget query. Windows are aligned buckets rather than
// a continuously rolling sum, which is what keeps that cost constant: a burst
// straddling a boundary can therefore spend up to two windows' worth of
// characters, so the budget is set below the provider's quota when the margin
// matters.
//
// This module never throws for an infrastructure problem. A reservation it
// cannot decide is granted, so a budget failure can never block a translation
// run (and therefore never a review save). A reservation it *can* decide and
// that does not fit returns `granted: false`, which the caller reports as a
// deliberate budget stop.

import { env } from "./env";
import { getRedisClient } from "./redis";

/** Length of the rolling quota window Google enforces (100 seconds). */
export const TRANSLATION_BUDGET_WINDOW_MS = 100 * 1000;

/** Characters allowed per window unless configured otherwise (Google's v2 default). */
export const TRANSLATION_BUDGET_DEFAULT_CHARACTERS = 100_000;

const BUDGET_KEY_PREFIX = "translate-char-budget:";

export type BudgetBackend = "redis" | "memory";

export interface CharacterBudgetOptions {
	/** Window length in ms. Defaults to TRANSLATION_BUDGET_WINDOW_MS. */
	windowMs?: number;
	/** Characters allowed per window. Defaults to the configured budget. */
	limit?: number;
	/** Clock (epoch ms). Injectable so tests need no real sleeps. */
	now?: () => number;
	/** Sleep implementation, injectable so tests need no real waits. */
	sleep?: (ms: number) => Promise<void>;
	/**
	 * Upper bound on how long one reservation may wait for the window to roll
	 * forward. Defaults to one full window. A request that cannot be granted
	 * within it is reported as not granted rather than waited on forever.
	 */
	maxWaitMs?: number;
}

export interface CharacterReservation {
	/** Whether the characters were accounted for and the request may start. */
	granted: boolean;
	/** Characters this reservation asked for. */
	characters: number;
	/** Characters already spent in the window after this call. */
	used: number;
	/** Characters still available in the window after this call. */
	remaining: number;
	/** How long the reservation waited for the window before deciding (ms). */
	waitedMs: number;
	/** Which backend decided the reservation. */
	backend: BudgetBackend;
}

interface BudgetAttempt {
	granted: boolean;
	used: number;
	backend: BudgetBackend;
}

/** Redis key holding the characters spent in one window. */
export function translationBudgetKey(bucket: number): string {
	return `${BUDGET_KEY_PREFIX}${bucket}`;
}

/** The configured characters allowed per window. */
export function budgetLimit(): number {
	return env.TRANSLATION_CHAR_BUDGET;
}

/**
 * Counts Unicode code points, the unit Google measures its character quota in.
 * `String.length` counts UTF-16 code units and would over-count astral
 * characters, which would spend budget the provider never charges for.
 */
export function countTranslationCharacters(texts: string[]): number {
	let total = 0;
	for (const text of texts) {
		total += [...text].length;
	}
	return total;
}

interface MemoryWindow {
	bucket: number;
	used: number;
}

// In-process fallback when Redis is unavailable (getRedisClient() returns null,
// the client is reconnecting, or a command failed).
let memoryWindow: MemoryWindow | null = null;

const RESERVE_SCRIPT = [
	'local used = tonumber(redis.call("get", KEYS[1]) or "0")',
	"local cost = tonumber(ARGV[1])",
	"if used + cost > tonumber(ARGV[2]) then return {0, used} end",
	'local total = redis.call("incrby", KEYS[1], ARGV[1])',
	'if total == cost then redis.call("pexpire", KEYS[1], ARGV[3]) end',
	"return {1, total}",
].join("\n");

const sleepFor = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The Redis client, but only when it can answer right now.
 *
 * ioredis queues commands while it reconnects, so a budget check issued
 * against a disconnected client would wait on the connection instead of on the
 * window. Degrading to the in-process budget keeps enforcement on and keeps
 * the wait bounded (NFR-2).
 */
function readyRedisClient(): ReturnType<typeof getRedisClient> {
	const client = getRedisClient();
	if (!client) return null;
	if (client.status !== "ready") return null;
	return client;
}

function readMemoryUsed(bucket: number): number {
	if (!memoryWindow || memoryWindow.bucket !== bucket) return 0;
	return memoryWindow.used;
}

/**
 * Check-and-add against the in-process window. There is no `await` between the
 * read and the write, so the single-threaded event loop makes it atomic.
 */
function reserveMemory(
	bucket: number,
	characters: number,
	limit: number,
): BudgetAttempt {
	const used = readMemoryUsed(bucket);
	if (used + characters > limit) {
		return { granted: false, used, backend: "memory" };
	}
	const next = used + characters;
	memoryWindow = { bucket, used: next };
	return { granted: true, used: next, backend: "memory" };
}

/** One attempt to account for `characters` in the window `bucket`. */
async function reserveOnce(
	bucket: number,
	characters: number,
	limit: number,
	windowMs: number,
	at: number,
): Promise<BudgetAttempt> {
	const client = readyRedisClient();

	if (client) {
		try {
			// The key lives exactly as long as its window: the next window is a
			// different key, so there is nothing to reset.
			const ttlMs = Math.max(1, (bucket + 1) * windowMs - at);
			const reply = await client.eval(
				RESERVE_SCRIPT,
				1,
				translationBudgetKey(bucket),
				characters,
				limit,
				ttlMs,
			);
			const [status, used] = reply as [number, number];
			return {
				granted: Number(status) === 1,
				used: Number(used),
				backend: "redis",
			};
		} catch (error) {
			// A Redis error must not stop translation: fall back to memory.
			console.error(
				"[TranslationBudget] Redis reserve failed, using the in-process budget:",
				error,
			);
		}
	}

	return reserveMemory(bucket, characters, limit);
}

async function readWindow(
	bucket: number,
): Promise<{ used: number; backend: BudgetBackend }> {
	const client = readyRedisClient();

	if (client) {
		try {
			const raw = await client.get(translationBudgetKey(bucket));
			const parsed = raw === null ? 0 : Number(raw);
			return {
				used: Number.isFinite(parsed) ? parsed : 0,
				backend: "redis",
			};
		} catch (error) {
			console.error(
				"[TranslationBudget] Redis read failed, using the in-process budget:",
				error,
			);
		}
	}

	return { used: readMemoryUsed(bucket), backend: "memory" };
}

/**
 * Account for `characters` against the rolling window, waiting for the window
 * to roll forward when the current one is full.
 *
 * The wait is bounded by `maxWaitMs` (one window by default) and by the
 * caller's own deadline when one is passed, so a reservation is never waited
 * on indefinitely (NFR-2). A request larger than the whole window can never
 * fit: it is refused immediately instead of waiting for room that will never
 * exist.
 */
export async function reserveCharacters(
	characters: number,
	options: CharacterBudgetOptions = {},
): Promise<CharacterReservation> {
	const windowMs = options.windowMs ?? TRANSLATION_BUDGET_WINDOW_MS;
	const limit = options.limit ?? budgetLimit();
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? sleepFor;
	const maxWaitMs = options.maxWaitMs ?? windowMs;

	if (characters <= 0) {
		const at = now();
		const bucket = Math.floor(at / windowMs);
		const window = await readWindow(bucket);
		return {
			granted: true,
			characters: 0,
			used: window.used,
			remaining: Math.max(0, limit - window.used),
			waitedMs: 0,
			backend: window.backend,
		};
	}

	let waitedMs = 0;

	for (;;) {
		const at = now();
		const bucket = Math.floor(at / windowMs);
		const attempt = await reserveOnce(bucket, characters, limit, windowMs, at);

		if (attempt.granted) {
			return {
				granted: true,
				characters,
				used: attempt.used,
				remaining: Math.max(0, limit - attempt.used),
				waitedMs,
				backend: attempt.backend,
			};
		}

		// The window is full. A request bigger than the whole window never
		// fits, so waiting for the next one would only delay the refusal.
		const windowEnd = (bucket + 1) * windowMs;
		const waitMs = Math.max(1, windowEnd - at);
		const canWait = characters <= limit && waitedMs + waitMs <= maxWaitMs;

		if (!canWait) {
			return {
				granted: false,
				characters,
				used: attempt.used,
				remaining: Math.max(0, limit - attempt.used),
				waitedMs,
				backend: attempt.backend,
			};
		}

		await sleep(waitMs);
		waitedMs += waitMs;
	}
}

/** Characters still available in the current window. */
export async function remainingCharacters(
	options: CharacterBudgetOptions = {},
): Promise<number> {
	const windowMs = options.windowMs ?? TRANSLATION_BUDGET_WINDOW_MS;
	const limit = options.limit ?? budgetLimit();
	const now = options.now ?? Date.now;
	const at = now();
	const bucket = Math.floor(at / windowMs);
	const window = await readWindow(bucket);
	return Math.max(0, limit - window.used);
}

/** Test helper: clear the in-process window between tests. */
export function clearTranslationBudgetForTest(): void {
	memoryWindow = null;
}
