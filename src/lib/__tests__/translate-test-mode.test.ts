// Tests for the offline translation stub.
//
// With TRANSLATION_TEST_MODE=1 the translation is produced locally: no
// provider client is created, no credentials are read, no request is sent
// and the translation cache is left alone. Without the flag the normal
// provider path is used.
//
// The Google client is mocked with an "echo" translator that prefixes each
// input with "ID:" - the same shape the provider mock in
// translate-batch.test.ts uses - so the provider path is observable through
// the returned text alone.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import * as loggerModule from "../logger";
import * as redisModule from "../redis";

type TranslateMock = (
	texts: string | string[],
	target?: string,
) => Promise<[string[]]>;

const echoTranslate: TranslateMock = (texts) =>
	Promise.resolve([
		(Array.isArray(texts) ? texts : [texts]).map((text) => `ID:${text}`),
	]);

const mockClientTranslate = mock<TranslateMock>(echoTranslate);

mock.module("@google-cloud/translate", () => ({
	v2: {
		Translate: class {
			translate = (texts: string | string[], target?: string) =>
				mockClientTranslate(texts, target);
		},
	},
}));

// Import AFTER mock.module so the mocked client is what translate.ts binds to.
const {
	TRANSLATION_TEST_MODE_PREFIX,
	TRANSLATION_TEST_MODE_SUFFIX,
	isTranslationTestMode,
	resetTranslateClientForTest,
	translateBatch,
	translateText,
} = await import("../translate");

const originalFlag = process.env.TRANSLATION_TEST_MODE;

let spies: Array<ReturnType<typeof spyOn>> = [];

beforeEach(() => {
	// A client memoized by another test file would defeat these assertions.
	resetTranslateClientForTest();
});

function spyOnRedisCache(cached: string | null = null): {
	getCachedTranslation: ReturnType<typeof spyOn>;
	setCachedTranslation: ReturnType<typeof spyOn>;
} {
	const getCachedTranslation = spyOn(
		redisModule,
		"getCachedTranslation",
	).mockReturnValue(Promise.resolve(cached) as never);
	const setCachedTranslation = spyOn(
		redisModule,
		"setCachedTranslation",
	).mockReturnValue(Promise.resolve() as never);
	spies.push(getCachedTranslation, setCachedTranslation);
	return { getCachedTranslation, setCachedTranslation };
}

afterEach(() => {
	if (originalFlag === undefined) {
		delete process.env.TRANSLATION_TEST_MODE;
	} else {
		process.env.TRANSLATION_TEST_MODE = originalFlag;
	}
	spies.forEach((spy) => spy.mockRestore());
	spies = [];
	mockClientTranslate.mockClear();
});

describe("translation test mode", () => {
	it("is off unless the flag is explicitly set", () => {
		expect(isTranslationTestMode()).toBe(false);

		process.env.TRANSLATION_TEST_MODE = "0";
		expect(isTranslationTestMode()).toBe(false);

		process.env.TRANSLATION_TEST_MODE = "true";
		expect(isTranslationTestMode()).toBe(false);

		process.env.TRANSLATION_TEST_MODE = "1";
		expect(isTranslationTestMode()).toBe(true);
	});

	it("produces the translation locally, with no provider client", async () => {
		process.env.TRANSLATION_TEST_MODE = "1";
		const clientInit = spyOn(loggerModule.logger, "info");
		spies.push(clientInit);
		const { getCachedTranslation, setCachedTranslation } = spyOnRedisCache();

		const result = await translateBatch(["Good morning", "World"], "id");

		expect(result).toEqual([
			`${TRANSLATION_TEST_MODE_PREFIX}Good morning${TRANSLATION_TEST_MODE_SUFFIX}`,
			`${TRANSLATION_TEST_MODE_PREFIX}World${TRANSLATION_TEST_MODE_SUFFIX}`,
		]);
		// The provider client is never created: nothing logs its creation.
		expect(
			clientInit.mock.calls.some((call) =>
				String(call[0]).includes("Initializing Google Cloud client"),
			),
		).toBe(false);
		// The cache is bypassed in both directions, so stub output is never
		// stored under a real cache key.
		expect(getCachedTranslation).not.toHaveBeenCalled();
		expect(setCachedTranslation).not.toHaveBeenCalled();
	});

	it("leaves blank text untouched", async () => {
		process.env.TRANSLATION_TEST_MODE = "1";
		spyOnRedisCache();

		expect(await translateBatch(["", "   "], "id")).toEqual(["", "   "]);
		expect(await translateText("", "id")).toBe("");
	});

	it("uses the normal provider path when the flag is not set", async () => {
		delete process.env.TRANSLATION_TEST_MODE;
		const { getCachedTranslation } = spyOnRedisCache();

		const result = await translateBatch(["Good morning"], "id", {
			delays: [0, 0, 0],
		});

		// The provider answered (the mocked client prefixes with "ID:").
		expect(result).toEqual(["ID:Good morning"]);
		expect(getCachedTranslation).toHaveBeenCalled();
	});
});
