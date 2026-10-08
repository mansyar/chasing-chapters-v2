// Tests for the reliable translation core: batched API calls, retry with
// backoff, and no silent English fallback on failure.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import * as redisModule from "../redis";

// Shared mock for the Google Cloud Translate client. Defaults to an "echo"
// translator that prefixes each input with "ID:" so any chunking strategy
// returns correctly-shaped results. The SDK resolves to a tuple of
// [translations, metadata]; the mock mirrors that shape.
// [translations, metadata] tuple, mirroring the real client's resolve value.
type TranslateMock = (
	texts: string | string[],
	target?: string,
) => Promise<[string[]]>;

const echoTranslate = (texts: string | string[]): Promise<[string[]]> =>
	Promise.resolve([
		(Array.isArray(texts) ? texts : [texts]).map((t) => `ID:${t}`),
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

// Import AFTER mock.module so the mocked client is what translate.ts binds to.
const {
	TRANSLATION_BATCH_SIZE,
	TranslationError,
	translateBatch,
	translateRichText,
	translateText,
} = await import("../translate");

// Default cache isolation: no cached translations unless a test overrides.
let defaultCacheSpies: Array<ReturnType<typeof spyOn>>;

beforeEach(() => {
	mockClientTranslate.mockClear();
	defaultCacheSpies = [
		spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve(null) as never,
		),
		spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		),
	];
});

afterEach(() => {
	defaultCacheSpies.forEach((spy) => spy.mockRestore());
});

describe("translateBatch", () => {
	beforeEach(() => {
		mockClientTranslate.mockImplementation(echoTranslate);
	});

	it("exports a positive default batch size", () => {
		expect(TRANSLATION_BATCH_SIZE).toBeGreaterThan(0);
	});

	it("translates all texts in a single API call when under batch size", async () => {
		const result = await translateBatch(["Good morning", "World"], "id", {
			delays: [0, 0, 0],
		});

		expect(result).toEqual(["ID:Good morning", "ID:World"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(mockClientTranslate).toHaveBeenCalledWith(
			["Good morning", "World"],
			"id",
		);
	});

	it("passes empty and whitespace-only texts through without API calls", async () => {
		const result = await translateBatch(["", "  ", "Hi"], "id", {
			delays: [0, 0, 0],
		});

		expect(result).toEqual(["", "  ", "ID:Hi"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(mockClientTranslate).toHaveBeenCalledWith(["Hi"], "id");
	});

	it("chunks large inputs into multiple API calls", async () => {
		const texts = ["one", "two", "three", "four", "five"];
		const result = await translateBatch(texts, "id", {
			delays: [0, 0, 0],
			batchSize: 2,
		});

		expect(result).toEqual(texts.map((t) => `ID:${t}`));
		expect(mockClientTranslate).toHaveBeenCalledTimes(3); // 2 + 2 + 1
	});

	it("deduplicates repeated texts into one API request", async () => {
		const result = await translateBatch(["Hi", "Hi", "Hi"], "id", {
			delays: [0, 0, 0],
		});

		expect(result).toEqual(["ID:Hi", "ID:Hi", "ID:Hi"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(mockClientTranslate).toHaveBeenCalledWith(["Hi"], "id");
	});

	it("retries failed API calls and succeeds on a later attempt", async () => {
		mockClientTranslate.mockImplementationOnce(() =>
			Promise.reject(new Error("API down")),
		);
		mockClientTranslate.mockImplementationOnce(() =>
			Promise.reject(new Error("API still down")),
		);

		const result = await translateBatch(["Hello"], "id", {
			delays: [0, 0, 0],
		});

		expect(result).toEqual(["ID:Hello"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(3);
	});

	it("throws TranslationError after the final retry instead of returning English", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(new Error("quota exceeded")),
		);

		let caught: unknown;
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(TranslationError);
		expect((caught as InstanceType<typeof TranslationError>).attempts).toBe(3);
		// The failure must never masquerade as a successful translation.
		expect((caught as Error).message).not.toBe("Hello");
		expect(mockClientTranslate).toHaveBeenCalledTimes(3);
	});

	it("uses cached translations without calling the API", async () => {
		const cacheSpy = spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve("Tersimpan") as never,
		);

		try {
			const result = await translateBatch(["Hello"], "id", {
				delays: [0, 0, 0],
			});

			expect(result).toEqual(["Tersimpan"]);
			expect(mockClientTranslate).not.toHaveBeenCalled();
		} finally {
			cacheSpy.mockRestore();
		}
	});

	it("mixes cached and fresh translations in correct order", async () => {
		const cacheSpy = spyOn(
			redisModule,
			"getCachedTranslation",
		).mockImplementation(async (text: string) =>
			text === "Hello" ? "Tersimpan" : null,
		);
		const setSpy = spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		);

		try {
			const result = await translateBatch(["Hello", "World"], "id", {
				delays: [0, 0, 0],
			});

			expect(result).toEqual(["Tersimpan", "ID:World"]);
			expect(mockClientTranslate).toHaveBeenCalledTimes(1);
			expect(mockClientTranslate).toHaveBeenCalledWith(["World"], "id");
			expect(setSpy).toHaveBeenCalledWith("World", "id", "ID:World");
		} finally {
			cacheSpy.mockRestore();
			setSpy.mockRestore();
		}
	});

	it("returns empty array for empty input without API calls", async () => {
		const result = await translateBatch([], "id", { delays: [0, 0, 0] });

		expect(result).toEqual([]);
		expect(mockClientTranslate).not.toHaveBeenCalled();
	});
});

describe("translateText (no fallback)", () => {
	beforeEach(() => {
		mockClientTranslate.mockImplementation(echoTranslate);
	});

	it("returns the translation on success", async () => {
		const result = await translateText("Hello");
		expect(result).toBe("ID:Hello");
	});

	it("propagates failure as TranslationError instead of returning English", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(new Error("API down")),
		);
		const cacheSpy = spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve(null) as never,
		);

		try {
			await expect(
				translateText("Hello", "id", { delays: [0, 0, 0] }),
			).rejects.toThrow(TranslationError);
		} finally {
			cacheSpy.mockRestore();
		}
	});
});

describe("translateRichText (no fallback)", () => {
	beforeEach(() => {
		mockClientTranslate.mockImplementation(echoTranslate);
	});

	function makeRichText() {
		return {
			root: {
				type: "root",
				children: [
					{
						type: "paragraph",
						children: [{ type: "text", text: "Good morning" }],
					},
					{
						type: "paragraph",
						format: "bold",
						children: [
							{ type: "text", text: "Hello" },
							{ type: "linebreak" },
							{ type: "text", text: "World" },
						],
					},
				],
			},
		};
	}

	it("translates all text nodes in one batched call, preserving structure", async () => {
		const result = (await translateRichText(makeRichText(), "id", {
			delays: [0, 0, 0],
		})) as { root: { children: Array<Record<string, unknown>> } };

		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(mockClientTranslate).toHaveBeenCalledWith(
			["Good morning", "Hello", "World"],
			"id",
		);

		const [para1, para2] = result.root.children;
		expect((para1.children as Array<{ text: string }>)[0].text).toBe(
			"ID:Good morning",
		);
		// Structure and non-text properties are preserved.
		expect(para2.format).toBe("bold");
		const para2Children = para2.children as Array<Record<string, unknown>>;
		expect(para2Children[0].text).toBe("ID:Hello");
		expect(para2Children[1].type).toBe("linebreak");
		expect(para2Children[2].text).toBe("ID:World");
	});

	it("propagates failure instead of returning the original English rich text", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(new Error("API down")),
		);

		await expect(
			translateRichText(makeRichText(), "id", { delays: [0, 0, 0] }),
		).rejects.toThrow(TranslationError);
	});
});
