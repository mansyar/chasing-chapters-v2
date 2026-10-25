// Tests for the translation utilities and for the provider retry policy:
// a quota response must cost exactly one attempt, and a failed attempt must
// log structured fields instead of the raw error object.
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { inspect } from "node:util";
import * as redisModule from "../redis";
import { clearTranslationBudgetForTest } from "../translation-budget";
import {
	classifyTranslationError,
	formatTranslationError,
} from "../translation-errors";
import { createFailedStatus } from "../translation-status";

// Shared mock for the Google Cloud Translate client, same shape as the one in
// translate-batch.test.ts: the SDK resolves to a [translations, metadata]
// tuple. The default implementation echoes each input back with an "ID:"
// prefix, so any chunking strategy returns correctly-shaped results.
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
			translate = (texts: string | string[], target?: string) =>
				mockClientTranslate(texts, target);
		},
	},
}));

// Import AFTER mock.module so translate.ts binds to the mocked client.
const {
	TranslationError,
	createRichTextFromPlain,
	extractPlainText,
	resetTranslateClientForTest,
	syncRichTextFormat,
	translateBatch,
} = await import("../translate");

/**
 * A quota response shaped like the one production logged on 2026-10-25: a
 * Google ApiError with the HTTP status, the `usageLimits` detail, and the live
 * HTTP response stream. `util.inspect` walks that stream into dozens of lines
 * of internals, which is what made the old log line unreadable.
 */
function quotaApiError(): Error {
	return Object.assign(new Error("User Rate Limit Exceeded"), {
		code: 403,
		errors: [
			{
				message: "User Rate Limit Exceeded",
				domain: "usageLimits",
				reason: "userRateLimitExceeded",
			},
		],
		response: {
			constructor: { name: "Gunzip" },
			_readableState: { objectMode: false, highWaterMark: 16384 },
			_writeState: { buffer: [], bufferIndex: 0 },
		},
	});
}

// Default cache isolation: no cached translations unless a test overrides.
let cacheSpies: Array<ReturnType<typeof spyOn>>;

beforeEach(() => {
	// Rebuild the client under this file's mock: another test file may have
	// memoized one under its own.
	resetTranslateClientForTest();
	mockClientTranslate.mockClear();
	mockClientTranslate.mockImplementation(echoTranslate);
	clearTranslationBudgetForTest();
	cacheSpies = [
		spyOn(redisModule, "getCachedTranslation").mockReturnValue(
			Promise.resolve(null) as never,
		),
		spyOn(redisModule, "setCachedTranslation").mockReturnValue(
			Promise.resolve() as never,
		),
	];
});

afterEach(() => {
	cacheSpies.forEach((spy) => spy.mockRestore());
});

/**
 * Concrete view of the rich text documents the utilities return, narrow
 * enough for the assertions below without casting individual nodes.
 */
type ResultTextNode = { type: string; text: string; [key: string]: unknown };
type ResultParagraphNode = {
	type: string;
	format?: string;
	children: ResultTextNode[];
	[key: string]: unknown;
};
type RichTextResult = {
	root: {
		children: ResultParagraphNode[];
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

describe("translate utilities", () => {
	describe("extractPlainText", () => {
		it("should extract text from simple paragraph", () => {
			const richText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [{ type: "text", text: "Hello world" }],
						},
					],
				},
			};
			expect(extractPlainText(richText)).toBe("Hello world");
		});

		it("should extract text from multiple paragraphs", () => {
			const richText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [{ type: "text", text: "First paragraph" }],
						},
						{
							type: "paragraph",
							children: [{ type: "text", text: "Second paragraph" }],
						},
					],
				},
			};
			expect(extractPlainText(richText)).toBe(
				"First paragraph\nSecond paragraph",
			);
		});

		it("should extract text from nested children", () => {
			const richText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [
								{ type: "text", text: "Normal " },
								{
									type: "bold",
									children: [{ type: "text", text: "bold" }],
								},
								{ type: "text", text: " text" },
							],
						},
					],
				},
			};
			expect(extractPlainText(richText)).toBe("Normal bold text");
		});

		it("should return empty string for null input", () => {
			expect(extractPlainText(null)).toBe("");
		});

		it("should return empty string for undefined input", () => {
			expect(extractPlainText(undefined)).toBe("");
		});

		it("should return empty string for empty root", () => {
			expect(extractPlainText({ root: {} })).toBe("");
		});
	});

	describe("createRichTextFromPlain", () => {
		it("should create Lexical structure for single line", () => {
			const result = createRichTextFromPlain("Hello world");
			expect(result).toEqual({
				root: {
					type: "root",
					children: [
						{
							type: "paragraph",
							children: [{ type: "text", text: "Hello world", version: 1 }],
							direction: "ltr",
							format: "",
							indent: 0,
							version: 1,
						},
					],
					direction: "ltr",
					format: "",
					indent: 0,
					version: 1,
				},
			});
		});

		it("should create multiple paragraphs for multi-line text", () => {
			const result = createRichTextFromPlain(
				"Line 1\nLine 2\nLine 3",
			) as RichTextResult;
			expect(result.root.children).toHaveLength(3);
			expect(result.root.children[0].children[0].text).toBe("Line 1");
			expect(result.root.children[1].children[0].text).toBe("Line 2");
			expect(result.root.children[2].children[0].text).toBe("Line 3");
		});

		it("should handle empty string", () => {
			const result = createRichTextFromPlain("") as RichTextResult;
			expect(result.root.children).toHaveLength(1);
			expect(result.root.children[0].children[0].text).toBe("");
		});
	});

	describe("syncRichTextFormat", () => {
		it("should preserve translated text with source format", () => {
			const sourceRichText = {
				root: {
					type: "root",
					children: [
						{
							type: "paragraph",
							format: "bold",
							children: [{ type: "text", text: "Original text" }],
						},
					],
				},
			};
			const targetRichText = {
				root: {
					type: "root",
					children: [
						{
							type: "paragraph",
							format: "",
							children: [{ type: "text", text: "Teks terjemahan" }],
						},
					],
				},
			};

			const result = syncRichTextFormat(
				sourceRichText,
				targetRichText,
			) as RichTextResult;

			// Should keep source structure but target text
			expect(result.root.children[0].format).toBe("bold");
			expect(result.root.children[0].children[0].text).toBe("Teks terjemahan");
		});

		it("should handle multiple text nodes", () => {
			const sourceRichText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [
								{ type: "text", text: "First" },
								{ type: "text", text: "Second" },
							],
						},
					],
				},
			};
			const targetRichText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [
								{ type: "text", text: "Pertama" },
								{ type: "text", text: "Kedua" },
							],
						},
					],
				},
			};

			const result = syncRichTextFormat(
				sourceRichText,
				targetRichText,
			) as RichTextResult;
			expect(result.root.children[0].children[0].text).toBe("Pertama");
			expect(result.root.children[0].children[1].text).toBe("Kedua");
		});

		it("should return source if target has no root", () => {
			const sourceRichText = {
				root: {
					children: [
						{
							type: "paragraph",
							children: [{ type: "text", text: "Original" }],
						},
					],
				},
			};

			const result = syncRichTextFormat(sourceRichText, null);
			expect(result).toEqual(sourceRichText);
		});

		it("should return source if source has no root", () => {
			const result = syncRichTextFormat(null, { root: {} });
			expect(result).toBeNull();
		});
	});
});

describe("provider retry policy", () => {
	/** Capture every `console.error` line the run writes, then restore. */
	function captureErrorLog(): { lines: string[]; restore: () => void } {
		const lines: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			// Mirror what the operator actually reads: one line per call, with
			// every argument serialized the way the console would.
			lines.push(
				args
					.map((arg) =>
						typeof arg === "string"
							? arg
							: inspect(arg, { depth: Number.POSITIVE_INFINITY }),
					)
					.join(" "),
			);
		};
		return { lines, restore: () => (console.error = original) };
	}

	it("costs exactly one provider call for a 403 userRateLimitExceeded", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(quotaApiError()),
		);

		let caught: unknown;
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch (error) {
			caught = error;
		}

		// The regression: before this change the loop burned all three
		// attempts on an allowance that was already gone.
		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(caught).toBeInstanceOf(TranslationError);
		expect((caught as InstanceType<typeof TranslationError>).attempts).toBe(1);
		expect(classifyTranslationError(caught).kind).toBe("quota");
	});

	it("reports the quota failure as a failed status with the actionable message", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(quotaApiError()),
		);

		let caught: unknown;
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch (error) {
			caught = error;
		}

		const attempts = caught instanceof TranslationError ? caught.attempts : 0;
		const failed = createFailedStatus(caught, attempts);
		expect(failed.status).toBe("failed");
		expect(failed.attempts).toBe(1);

		// The admin UI reads the persisted string, so it must carry the
		// actionable quota guidance rather than a bare "User Rate Limit".
		const stored = formatTranslationError(caught);
		expect(stored).toContain("Translation quota exceeded.");
		expect(stored).toContain("Wait a few minutes before retrying");
	});

	it("logs code, reason and character count without dumping the error object", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(quotaApiError()),
		);
		const log = captureErrorLog();
		try {
			await translateBatch(["Hello", "World"], "id", { delays: [0, 0, 0] });
		} catch {
			// The failure itself is asserted elsewhere.
		} finally {
			log.restore();
		}

		const line = log.lines.join("\n");
		expect(line).toContain("403");
		expect(line).toContain("userRateLimitExceeded");
		// "Hello" + "World" is ten code points, the unit the quota charges in.
		expect(line).toContain("characters: 10");
		expect(line).toContain("texts: 2");
		expect(line).toContain("attempt: 1");

		// The defect: the raw ApiError used to reach console.error, whose
		// inspect walked the Gunzip response stream.
		expect(line).not.toContain("Gunzip");
		expect(line).not.toContain("_readableState");
		expect(line).not.toContain("_writeState");
	});

	it("keeps the raw detail, bounded", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(quotaApiError()),
		);
		const log = captureErrorLog();
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch {
			// Expected.
		} finally {
			log.restore();
		}

		const line = log.lines.join("\n");
		// The stack is occasionally the only clue, so it is kept — but a single
		// failure must not become a screenful.
		expect(line).toContain("detail:");
		expect(line).toContain("User Rate Limit Exceeded");
		expect(line.length).toBeLessThan(2000);
	});

	it("still retries a network failure", async () => {
		mockClientTranslate.mockImplementationOnce(() =>
			Promise.reject(Object.assign(new Error("ECONNRESET"), { code: 503 })),
		);

		const result = await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });

		expect(result).toEqual(["ID:Hello"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(2);
	});

	it("still retries a timeout", async () => {
		mockClientTranslate.mockImplementationOnce(() =>
			Promise.reject(
				new Error("Translation request timed out after 30 seconds"),
			),
		);

		const result = await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });

		expect(result).toEqual(["ID:Hello"]);
		expect(mockClientTranslate).toHaveBeenCalledTimes(2);
	});

	it("still exhausts every attempt for an unexpected failure", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(new Error("API down")),
		);

		let caught: unknown;
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch (error) {
			caught = error;
		}

		// The non-retryable set must not widen by accident: an unclassified
		// failure keeps the three-attempt behaviour.
		expect(mockClientTranslate).toHaveBeenCalledTimes(3);
		expect((caught as InstanceType<typeof TranslationError>).attempts).toBe(3);
	});

	it("does not retry a rejected credential either", async () => {
		mockClientTranslate.mockImplementation(() =>
			Promise.reject(
				Object.assign(new Error("Permission denied on Cloud Translation API"), {
					code: 403,
					errors: [{ reason: "forbidden" }],
				}),
			),
		);

		let caught: unknown;
		try {
			await translateBatch(["Hello"], "id", { delays: [0, 0, 0] });
		} catch (error) {
			caught = error;
		}

		expect(mockClientTranslate).toHaveBeenCalledTimes(1);
		expect(classifyTranslationError(caught).kind).toBe("credentials");
		expect(classifyTranslationError(caught).transient).toBe(false);
	});
});
