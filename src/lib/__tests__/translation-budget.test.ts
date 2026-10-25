// Tests for the rolling character budget: the Redis-backed window, the
// in-process fallback, the bounded wait, and the wiring into translateBatch.
//
// Every wait is exercised with an injected clock and an injected sleep, so no
// test really sleeps: the fake sleep moves the clock forward instead.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { env } from "../env";
import * as redisModule from "../redis";
import {
	budgetLimit,
	clearTranslationBudgetForTest,
	countTranslationCharacters,
	remainingCharacters,
	reserveCharacters,
	TRANSLATION_BUDGET_DEFAULT_CHARACTERS,
	TRANSLATION_BUDGET_WINDOW_MS,
	translationBudgetKey,
} from "../translation-budget";

// Shared mock for the Google Cloud Translate client. The budget tests only
// need it to observe whether a request was sent and to echo a result back.
type TranslateMock = (
	texts: string | string[],
	target?: string,
) => Promise<[string[]]>;

const echoTranslate = (texts: string | string[]): Promise<[string[]]> =>
	Promise.resolve([
		(Array.isArray(texts) ? texts : [texts]).map((text) => `ID:${text}`),
	]);

const mockClientTranslate = mock<TranslateMock>(echoTranslate);

mock.module("@google-cloud/translate", () => ({
	v2: {
		Translate: class {
			translate = (texts: string | string[], _target?: string) =>
				mockClientTranslate(texts, _target);
		},
	},
}));

// Import AFTER mock.module so translate.ts binds to the mocked client.
const {
	TRANSLATION_CHARACTER_BUDGET_REASON,
	TranslationBudgetError,
	resetTranslateClientForTest,
	translateBatch,
} = await import("../translate");

afterEach(() => {
	clearTranslationBudgetForTest();
	mock.restore();
});

beforeEach(() => {
	resetTranslateClientForTest();
	mockClientTranslate.mockClear();
	mockClientTranslate.mockImplementation(echoTranslate);
});

/** A clock and a sleep that advances it, so a wait costs no real time. */
function fakeClock(start: number) {
	let current = start;
	const sleep = mock(async (ms: number) => {
		current += ms;
	});
	return {
		now: () => current,
		sleep,
		advance: (ms: number) => {
			current += ms;
		},
	};
}

interface FakeRedisClient {
	status: string;
	eval: (...args: unknown[]) => Promise<unknown>;
	get: (...args: unknown[]) => Promise<unknown>;
}

/** Install a fake Redis client behind getRedisClient for the Redis paths. */
function useFakeRedisClient(overrides: Partial<FakeRedisClient> = {}) {
	const fake: FakeRedisClient = {
		status: "ready",
		eval: mock(async () => [1, 0]),
		get: mock(async () => null),
		...overrides,
	};
	const spy = spyOn(redisModule, "getRedisClient").mockReturnValue(
		fake as unknown as ReturnType<typeof redisModule.getRedisClient>,
	);
	return { fake, spy };
}

/** No Redis: the budget must fall back to its in-process window. */
function useMemoryBackend() {
	return spyOn(redisModule, "getRedisClient").mockReturnValue(null);
}

describe("reserveCharacters (in-process fallback)", () => {
	it("grants characters under the limit and reports the remainder", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		const first = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});
		expect(first.granted).toBe(true);
		expect(first.used).toBe(400);
		expect(first.remaining).toBe(600);
		expect(first.waitedMs).toBe(0);
		expect(first.backend).toBe("memory");

		const second = await reserveCharacters(600, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});
		expect(second.granted).toBe(true);
		expect(second.used).toBe(1000);
		expect(second.remaining).toBe(0);
	});

	it("defers a request that would overflow the window until it rolls forward", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		await reserveCharacters(800, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		// 800 + 400 overflows a 1000-character window: the reservation must
		// wait for the boundary instead of granting and overrunning it.
		const deferred = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(deferred.granted).toBe(true);
		// It waited exactly the remaining window, and it did so before the
		// characters were counted.
		expect(deferred.waitedMs).toBe(TRANSLATION_BUDGET_WINDOW_MS);
		expect(clock.sleep).toHaveBeenCalledTimes(1);
		expect(clock.sleep.mock.calls[0][0]).toBe(TRANSLATION_BUDGET_WINDOW_MS);
		// The new window starts empty: the overflow did not carry over.
		expect(deferred.used).toBe(400);
		expect(deferred.remaining).toBe(600);
	});

	it("refuses without waiting when the request is larger than the whole window", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		const refused = await reserveCharacters(1500, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		// No window will ever have room for it, so waiting would only delay
		// the refusal.
		expect(refused.granted).toBe(false);
		expect(refused.waitedMs).toBe(0);
		expect(clock.sleep).not.toHaveBeenCalled();
	});

	it("bounds the wait instead of blocking indefinitely", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		await reserveCharacters(1000, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		const refused = await reserveCharacters(1, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
			maxWaitMs: 10,
		});

		expect(refused.granted).toBe(false);
		expect(refused.waitedMs).toBe(0);
		expect(clock.sleep).not.toHaveBeenCalled();
	});

	it("counts code points, not UTF-16 units", () => {
		// An astral character is two UTF-16 units but one code point.
		expect(countTranslationCharacters(["😀"])).toBe(1);
		expect(countTranslationCharacters(["Hello", "😀😀"])).toBe(7);
	});

	it("spends nothing for an empty request", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		const result = await reserveCharacters(0, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(result.granted).toBe(true);
		expect(result.used).toBe(0);
		expect(result.remaining).toBe(1000);
	});
});

describe("reserveCharacters (Redis-backed)", () => {
	it("reserves through a time-bucketed key that expires at the window boundary", async () => {
		const { fake } = useFakeRedisClient({ eval: mock(async () => [1, 400]) });
		const clock = fakeClock(250_000);

		const result = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(result.granted).toBe(true);
		expect(result.backend).toBe("redis");
		expect(fake.eval).toHaveBeenCalledTimes(1);
		const [script, keyCount, key, characters, limit, ttlMs] = (
			fake.eval as ReturnType<typeof mock>
		).mock.calls[0] as [string, number, string, number, number, number];
		expect(script).toContain('redis.call("incrby", KEYS[1], ARGV[1])');
		expect(keyCount).toBe(1);
		// 250s falls in the window starting at 200s.
		expect(key).toBe(translationBudgetKey(2));
		expect(key).toBe("translate-char-budget:2");
		expect(characters).toBe(400);
		expect(limit).toBe(1000);
		// The key lives exactly to the end of its own window.
		expect(ttlMs).toBe(50_000);
	});

	it("waits for the window when Redis refuses the reservation", async () => {
		let call = 0;
		const { fake } = useFakeRedisClient({
			eval: mock(async () => {
				call += 1;
				return call === 1 ? [0, 1000] : [1, 400];
			}),
		});
		const clock = fakeClock(0);

		const result = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(result.granted).toBe(true);
		expect(result.waitedMs).toBe(TRANSLATION_BUDGET_WINDOW_MS);
		expect(fake.eval).toHaveBeenCalledTimes(2);
		const keys = (fake.eval as ReturnType<typeof mock>).mock.calls.map(
			(call) => call[2],
		);
		// The retry targets the next window's key, not the exhausted one.
		expect(keys).toEqual([translationBudgetKey(0), translationBudgetKey(1)]);
	});

	it("falls back to the in-process budget when a Redis command fails", async () => {
		useFakeRedisClient({
			eval: mock(async () => {
				throw new Error("connection refused");
			}),
		});
		const clock = fakeClock(0);

		const first = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});
		expect(first.granted).toBe(true);
		expect(first.backend).toBe("memory");

		// Enforcement continues in memory: 400 + 700 no longer fits, and the
		// wait bound refuses it rather than granting it.
		const second = await reserveCharacters(700, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
			maxWaitMs: 0,
		});
		expect(second.granted).toBe(false);
		expect(second.backend).toBe("memory");
	});

	it("falls back to the in-process budget when the client is not connected", async () => {
		const { fake } = useFakeRedisClient({ status: "reconnecting" });
		const clock = fakeClock(0);

		const result = await reserveCharacters(400, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(result.granted).toBe(true);
		expect(result.backend).toBe("memory");
		// A queued command behind a reconnecting client would wait on the
		// connection, so none is issued.
		expect(fake.eval).not.toHaveBeenCalled();
	});

	it("reports the remaining budget from the Redis window", async () => {
		useFakeRedisClient({ get: mock(async () => "250") });

		expect(await remainingCharacters({ limit: 1000, now: () => 0 })).toBe(750);
	});

	it("falls back to the in-process window when the Redis read fails", async () => {
		useFakeRedisClient({
			get: mock(async () => {
				throw new Error("connection refused");
			}),
		});

		// The read could not be answered, so the in-process window answers
		// instead of the query failing.
		expect(await remainingCharacters({ limit: 1000, now: () => 0 })).toBe(1000);
	});
});

describe("remainingCharacters", () => {
	it("reports what the in-process window has left", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);

		expect(await remainingCharacters({ limit: 1000, now: clock.now })).toBe(
			1000,
		);

		await reserveCharacters(250, {
			limit: 1000,
			now: clock.now,
			sleep: clock.sleep,
		});

		expect(await remainingCharacters({ limit: 1000, now: clock.now })).toBe(
			750,
		);
	});
});

describe("configured limit", () => {
	it("defaults to 100,000 characters per 100-second window", () => {
		expect(TRANSLATION_BUDGET_DEFAULT_CHARACTERS).toBe(100_000);
		expect(TRANSLATION_BUDGET_WINDOW_MS).toBe(100_000);
		expect(Number.isInteger(env.TRANSLATION_CHAR_BUDGET)).toBe(true);
		expect(env.TRANSLATION_CHAR_BUDGET).toBeGreaterThan(0);
		expect(budgetLimit()).toBe(env.TRANSLATION_CHAR_BUDGET);
	});

	it("changes the enforced limit when the env var changes", async () => {
		useMemoryBackend();
		const clock = fakeClock(0);
		const original = env.TRANSLATION_CHAR_BUDGET;

		try {
			// Raised console quota: 10,000,000 characters per window.
			env.TRANSLATION_CHAR_BUDGET = 10_000_000;
			expect(budgetLimit()).toBe(10_000_000);

			const raised = await reserveCharacters(500_000, {
				now: clock.now,
				sleep: clock.sleep,
			});
			expect(raised.granted).toBe(true);
			expect(raised.remaining).toBe(9_500_000);

			// The same request against the default budget would not fit.
			env.TRANSLATION_CHAR_BUDGET = 100_000;
			clearTranslationBudgetForTest();
			const atDefault = await reserveCharacters(500_000, {
				now: clock.now,
				sleep: clock.sleep,
			});
			expect(atDefault.granted).toBe(false);
		} finally {
			env.TRANSLATION_CHAR_BUDGET = original;
		}
	});
});

describe("translateBatch budget wiring", () => {
	it("reserves nothing for cache hits", async () => {
		useMemoryBackend();
		const cacheSpy = spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve("Tersimpan") as never,
		);
		const setSpy = spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		);

		try {
			const result = await translateBatch(["Hello"], "id", {
				delays: [0, 0, 0],
			});

			expect(result).toEqual(["Tersimpan"]);
			// A cache hit sends no characters, so it spends no budget.
			expect(await remainingCharacters()).toBe(budgetLimit());
			expect(mockClientTranslate).not.toHaveBeenCalled();
		} finally {
			cacheSpy.mockRestore();
			setSpy.mockRestore();
		}
	});

	it("reserves a request's characters before it reaches the provider", async () => {
		useMemoryBackend();
		const cacheSpy = spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve(null) as never,
		);
		const setSpy = spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		);

		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });

			expect(mockClientTranslate).toHaveBeenCalledTimes(1);
			expect(await remainingCharacters()).toBe(budgetLimit() - 5);
		} finally {
			cacheSpy.mockRestore();
			setSpy.mockRestore();
		}
	});

	it("does not reach the provider when the budget cannot be reserved", async () => {
		useMemoryBackend();
		const cacheSpy = spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve(null) as never,
		);
		const setSpy = spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		);
		const original = env.TRANSLATION_CHAR_BUDGET;

		try {
			// A budget smaller than one text: the request can never be
			// granted, so it is refused rather than deferred forever.
			env.TRANSLATION_CHAR_BUDGET = 3;
			let caught: unknown;
			try {
				await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
			} catch (error) {
				caught = error;
			}

			expect(caught).toBeInstanceOf(TranslationBudgetError);
			expect((caught as Error).message).toBe(
				TRANSLATION_CHARACTER_BUDGET_REASON,
			);
			// A budget stop is not a provider failure: nothing was sent.
			expect(mockClientTranslate).not.toHaveBeenCalled();
		} finally {
			env.TRANSLATION_CHAR_BUDGET = original;
			cacheSpy.mockRestore();
			setSpy.mockRestore();
		}
	});
});
