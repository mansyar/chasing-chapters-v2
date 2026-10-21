import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as redisModule from "../redis";
import {
	acquireTranslationLock,
	clearTranslationLocksForTest,
	releaseTranslationLock,
	TRANSLATION_LOCK_TTL_MS,
	translationLockKey,
} from "../translation-lock";

afterEach(() => {
	clearTranslationLocksForTest();
	mock.restore();
});

interface FakeRedisClient {
	set: (...args: unknown[]) => Promise<unknown>;
	eval: (...args: unknown[]) => Promise<unknown>;
}

/** Install a fake Redis client behind getRedisClient for Redis-path tests. */
function useFakeRedisClient(overrides: Partial<FakeRedisClient> = {}) {
	const fake: FakeRedisClient = {
		set: mock(async () => "OK"),
		eval: mock(async () => 1),
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
