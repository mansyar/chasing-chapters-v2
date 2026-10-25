import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as redisModule from "../redis";
import {
	MAX_ATTEMPTS,
	RETRY_DELAYS_MS,
	TRANSLATION_REQUEST_TIMEOUT_MS,
} from "../translate";
import { TRANSLATION_BUDGET_WINDOW_MS } from "../translation-budget";
import {
	acquireTranslationLock,
	clearTranslationLocksForTest,
	isTranslationLocked,
	releaseTranslationLock,
	TRANSLATION_LOCK_TTL_MS,
	TRANSLATION_PIPELINE_STEPS,
	TRANSLATION_WORST_CASE_STEP_MS,
	translationLockKey,
} from "../translation-lock";

afterEach(() => {
	clearTranslationLocksForTest();
	mock.restore();
});

interface FakeRedisClient {
	set: (...args: unknown[]) => Promise<unknown>;
	eval: (...args: unknown[]) => Promise<unknown>;
	get: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Install a fake Redis client behind getRedisClient for Redis-path tests.
 * `get` defaults to "no lock"; the lock check reads it.
 */
function useFakeRedisClient(overrides: Partial<FakeRedisClient> = {}) {
	const fake: FakeRedisClient = {
		set: mock(async () => "OK"),
		eval: mock(async () => 1),
		get: mock(async () => null),
		...overrides,
	};
	const spy = spyOn(redisModule, "getRedisClient").mockReturnValue(
		fake as unknown as ReturnType<typeof redisModule.getRedisClient>,
	);
	return { fake, spy };
}

describe("translation-lock (in-memory fallback)", () => {
	test("acquire returns a token, second acquire returns null", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const first = await acquireTranslationLock(1);
		expect(first).toBeString();
		const second = await acquireTranslationLock(1);
		expect(second).toBeNull();
	});

	test("concurrent triggers yield exactly one pipeline lock", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const results = await Promise.all([
			acquireTranslationLock(1),
			acquireTranslationLock(1),
			acquireTranslationLock(1),
			acquireTranslationLock(1),
			acquireTranslationLock(1),
		]);
		const acquired = results.filter((token) => token !== null);
		expect(acquired.length).toBe(1);
	});

	test("locks are per-review", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		expect(await acquireTranslationLock(1)).not.toBeNull();
		expect(await acquireTranslationLock(2)).not.toBeNull();
	});

	test("release allows re-acquire; only the holder's token releases", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const token = await acquireTranslationLock(1);
		expect(token).not.toBeNull();
		if (!token) throw new Error("lock not acquired");

		// A different token must not free the lock.
		await releaseTranslationLock(1, "not-the-holder");
		expect(await acquireTranslationLock(1)).toBeNull();

		await releaseTranslationLock(1, token);
		expect(await acquireTranslationLock(1)).not.toBeNull();
	});

	test("expired locks are self-healing", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const token = await acquireTranslationLock(1, 1);
		expect(token).not.toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(await acquireTranslationLock(1)).not.toBeNull();
	});

	test("string ids are supported", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const token = await acquireTranslationLock("abc");
		expect(token).not.toBeNull();
		expect(await acquireTranslationLock("abc")).toBeNull();
		await releaseTranslationLock("abc", token as string);
		expect(await acquireTranslationLock("abc")).not.toBeNull();
	});
});

describe("translation-lock TTL derivation", () => {
	/**
	 * The worst case one translation step can take, recomputed here from the
	 * retry policy, the request timeout and the budget window — deliberately
	 * NOT read from the module's own derived constant, so the assertion can
	 * fail if the derivation drifts from the policy it is supposed to outlive.
	 */
	const worstCaseStepMs =
		MAX_ATTEMPTS *
			(TRANSLATION_BUDGET_WINDOW_MS + TRANSLATION_REQUEST_TIMEOUT_MS) +
		RETRY_DELAYS_MS.slice(0, MAX_ATTEMPTS - 1).reduce(
			(total, delay) => total + delay,
			0,
		);

	test("the TTL exceeds one step's worst case derived from the retry and timeout constants", () => {
		// 3 × (100s budget wait + 30s request timeout) + (2s + 8s backoff)
		expect(worstCaseStepMs).toBe(400_000);
		expect(TRANSLATION_WORST_CASE_STEP_MS).toBe(worstCaseStepMs);
		expect(TRANSLATION_LOCK_TTL_MS).toBeGreaterThan(worstCaseStepMs);
	});

	test("the TTL covers every step of one run, not one step", () => {
		// A run translates five steps in sequence: four rich-text fields plus
		// the batched favorite-quote call.
		expect(TRANSLATION_LOCK_TTL_MS).toBe(
			TRANSLATION_PIPELINE_STEPS * worstCaseStepMs,
		);
		expect(TRANSLATION_LOCK_TTL_MS).toBeGreaterThanOrEqual(
			TRANSLATION_PIPELINE_STEPS * worstCaseStepMs,
		);
	});

	test("the TTL is no longer the fixed 10 minutes it used to be", () => {
		// The defect: 10 minutes is shorter than one run's worst case, so a
		// slow provider outlived its own lock and a second run could start.
		expect(TRANSLATION_LOCK_TTL_MS).toBeGreaterThan(10 * 60 * 1000);
		expect(TRANSLATION_LOCK_TTL_MS).toBe(33 * 60 * 1000 + 20 * 1000);
	});
});

describe("translation-lock (Redis-backed)", () => {
	test("acquire issues SET NX PX with the lock key and TTL", async () => {
		const { fake } = useFakeRedisClient();

		const token = await acquireTranslationLock(7);
		expect(token).toBeString();
		expect(fake.set).toHaveBeenCalledTimes(1);
		const [key, setToken, pxFlag, pxValue, nxFlag] = (
			fake.set as ReturnType<typeof mock>
		).mock.calls[0] as [string, string, string, number, string];
		expect(key).toBe(translationLockKey(7));
		expect(key).toBe("translate-lock:7");
		expect(setToken).toBe(token as string);
		expect(pxFlag).toBe("PX");
		expect(pxValue).toBe(TRANSLATION_LOCK_TTL_MS);
		expect(nxFlag).toBe("NX");
	});

	test("a second trigger while locked is a no-op (null, no extra SET)", async () => {
		let calls = 0;
		useFakeRedisClient({
			set: mock(async () => {
				calls += 1;
				return calls === 1 ? "OK" : null;
			}),
		});

		expect(await acquireTranslationLock(7)).not.toBeNull();
		expect(await acquireTranslationLock(7)).toBeNull();
		expect(await acquireTranslationLock(7)).toBeNull();
		expect(calls).toBe(3);
	});

	test("release uses compare-and-delete with the holder token", async () => {
		const { fake } = useFakeRedisClient();

		const token = await acquireTranslationLock(7);
		expect(token).toBeString();
		await releaseTranslationLock(7, token as string);

		expect(fake.eval).toHaveBeenCalledTimes(1);
		const [script, numKeys, key, evalToken] = (
			fake.eval as ReturnType<typeof mock>
		).mock.calls[0] as [string, number, string, string];
		expect(script).toContain('redis.call("get", KEYS[1])');
		expect(script).toContain('redis.call("del", KEYS[1])');
		expect(numKeys).toBe(1);
		expect(key).toBe("translate-lock:7");
		expect(evalToken).toBe(token as string);
	});

	test("release does not free the lock when the token differs", async () => {
		const { fake } = useFakeRedisClient();
		// Script returns 0 when the token does not match.
		fake.eval = mock(async () => 0);

		await releaseTranslationLock(7, "stale-token");
		expect(fake.eval).toHaveBeenCalledTimes(1);
	});

	test("Redis errors fall back to the in-memory path on acquire", async () => {
		useFakeRedisClient({
			set: mock(async () => {
				throw new Error("connection refused");
			}),
		});

		const token = await acquireTranslationLock(7);
		expect(token).toBeString();
		expect(await acquireTranslationLock(7)).toBeNull();

		await releaseTranslationLock(7, token as string);
		expect(await acquireTranslationLock(7)).toBeString();
	});

	test("Redis errors on release are swallowed", async () => {
		useFakeRedisClient({
			eval: mock(async () => {
				throw new Error("connection refused");
			}),
		});

		const token = await acquireTranslationLock(7);
		expect(token).toBeString();
		await expect(
			releaseTranslationLock(7, token as string),
		).resolves.toBeUndefined();
	});
});

describe("isTranslationLocked", () => {
	test("a Redis lock is reported as locked", async () => {
		const { fake } = useFakeRedisClient({
			get: mock(async () => "lock-token"),
		});

		expect(await isTranslationLocked(7)).toBe(true);
		const [key] = (fake.get as ReturnType<typeof mock>).mock.calls[0] as [
			string,
		];
		expect(key).toBe(translationLockKey(7));
	});

	test("no Redis lock and no memory lock → not locked", async () => {
		useFakeRedisClient({ get: mock(async () => null) });

		expect(await isTranslationLocked(7)).toBe(false);
	});

	test("a Redis error falls through to the in-memory map (live lock)", async () => {
		useFakeRedisClient({
			// The acquire also fails and falls back to the memory lock.
			set: mock(async () => {
				throw new Error("connection refused");
			}),
			get: mock(async () => {
				throw new Error("connection refused");
			}),
		});

		const token = await acquireTranslationLock(7);
		expect(token).not.toBeNull();

		expect(await isTranslationLocked(7)).toBe(true);

		await releaseTranslationLock(7, token as string);
		expect(await isTranslationLocked(7)).toBe(false);
	});

	test("a Redis error falls through to the in-memory map (expired lock)", async () => {
		useFakeRedisClient({
			set: mock(async () => {
				throw new Error("connection refused");
			}),
			get: mock(async () => {
				throw new Error("connection refused");
			}),
		});

		const token = await acquireTranslationLock(7, 1);
		expect(token).not.toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(await isTranslationLocked(7)).toBe(false);
	});

	test("the memory-only path reports a live lock", async () => {
		spyOn(redisModule, "getRedisClient").mockReturnValue(null);

		const token = await acquireTranslationLock(7);
		expect(token).not.toBeNull();

		expect(await isTranslationLocked(7)).toBe(true);

		await releaseTranslationLock(7, token as string);
		expect(await isTranslationLocked(7)).toBe(false);
	});
});
