import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type Mock,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { Payload } from "payload";
import * as redisModule from "../../lib/redis";
import type { RichTextDocument } from "../../lib/utils";
import type { Review } from "../../payload-types";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TextNode = { type: "text"; text: string; version: number };
type ParagraphNode = {
	type: "paragraph";
	format?: string;
	version: number;
	children: TextNode[];
};
/** Fixture rich text shape, assignable to Review["reviewContent"]. */
type RichText = {
	root: {
		type: "root";
		children: ParagraphNode[];
		direction: "ltr" | null;
		format: "";
		indent: number;
		version: number;
	};
};

function makeRichText(...paragraphs: ParagraphNode[]): RichText {
	return {
		root: {
			type: "root",
			children: paragraphs,
			direction: null,
			format: "",
			indent: 0,
			version: 1,
		},
	};
}

function para(text: string, format?: string): ParagraphNode {
	return {
		type: "paragraph",
		...(format ? { format } : {}),
		version: 1,
		children: [{ type: "text", text, version: 1 }],
	};
}

type TranslateReviewModule = typeof import("../translateReview");
type TranslateModule = typeof import("../../lib/translate");

type TranslateRichTextSpy = ReturnType<
	typeof spyOn<TranslateModule, "translateRichText">
>;
type TranslateTextSpy = ReturnType<
	typeof spyOn<TranslateModule, "translateText">
>;

/** Arg shape of the payload.update calls the translation pipeline makes. */
type UpdateArgs = {
	collection: string;
	id: number;
	locale?: string;
	data: {
		translationStatus?: string;
		translationError?: string | null;
		translationUpdatedAt?: string;
		englishUpdatedAt?: string;
		/** Optional: the "pending" status update sends no content fields. */
		reviewContent?: RichText;
		favoriteQuotes: { quote: string; page?: string | null }[];
		[key: string]: unknown;
	};
	context: { skipTranslation?: boolean };
};

/** Minimal review-shaped doc for decision + pipeline tests. */
function makeDoc(overrides: Partial<Review> = {}): Review {
	return {
		id: 1,
		title: "A Great Book",
		bookAuthor: "Some Author",
		rating: 5,
		coverImage: 1,
		author: 1,
		reviewContent: makeRichText(para("Hello world")),
		whatILoved: null,
		whatCouldBeBetter: null,
		perfectFor: null,
		favoriteQuotes: null,
		autoTranslate: true,
		translationStatus: "translated",
		updatedAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		_status: "published",
		...overrides,
	};
}

/**
 * Minimal mocked Payload Local API. `findByID` answers with a published
 * review: the delayed re-run re-reads the review and skips unpublished ones.
 */
function makePayload() {
	return {
		update: mock(async (_args: UpdateArgs) => ({})),
		findByID: mock(async (_args: { collection: string; id: number }) =>
			makeDoc(),
		),
	};
}

/**
 * A Payload mock whose stored document can be changed between runs — the
 * delayed re-run reads the review again before translating it.
 */
function makeStatefulPayload(initial: Review) {
	const state = { doc: initial };
	const payload = {
		update: mock(async (args: UpdateArgs) => {
			state.doc = { ...state.doc, ...args.data } as Review;
			return {};
		}),
		findByID: mock(async () => state.doc),
	};
	return { payload, state };
}

// ---------------------------------------------------------------------------
// Mock the Google translate layer so no credentials/network are needed.
// The echo translator mirrors the SDK v2 tuple response shape: [string[]]
// ---------------------------------------------------------------------------

const echoTranslate = (texts: string | string[]): Promise<[string[]]> => {
	const arr = Array.isArray(texts) ? texts : [texts];
	return Promise.resolve([arr.map((t) => `ID:${t}`)]);
};

type TranslateMock = (texts: string | string[]) => Promise<[string[]]>;
const mockClientTranslate: TranslateMock = mock(echoTranslate);

mock.module("@google-cloud/translate", () => ({
	v2: {
		Translate: class {
			translate = mockClientTranslate;
		},
	},
}));

// ---------------------------------------------------------------------------

describe("decideTranslationAction", () => {
	// The module under test is imported after mock.module registers the
	// @google-cloud/translate stub (see translate-batch.test.ts for precedent).
	// Decision logic is pure — extractPlainText never touches the network — so
	// the import is safe.
	let decideTranslationAction: TranslateReviewModule["decideTranslationAction"];

	beforeEach(async () => {
		const mod = await import("../translateReview");
		decideTranslationAction = mod.decideTranslationAction;
	});

	test("skipTranslation context → none (recursion guard)", () => {
		const result = decideTranslationAction({
			doc: makeDoc(),
			previousDoc: makeDoc(),
			context: { skipTranslation: true },
		});
		expect(result).toBe("none");
	});

	test("draft doc → none (drafts translate on demand only)", () => {
		const result = decideTranslationAction({
			doc: makeDoc({ _status: "draft" }),
			previousDoc: makeDoc({ _status: "draft" }),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("first publish with auto-translate ON → translate", () => {
		const result = decideTranslationAction({
			doc: makeDoc(),
			previousDoc: makeDoc({ _status: "draft" }),
			context: {},
		});
		expect(result).toBe("translate");
	});

	test("text changed with auto-translate ON → translate", () => {
		const result = decideTranslationAction({
			doc: makeDoc({ reviewContent: makeRichText(para("Changed text")) }),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("translate");
	});

	test("text changed with auto-translate OFF → mark-stale (no auto overwrite)", () => {
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				reviewContent: makeRichText(para("Changed text")),
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("mark-stale");
	});

	test("first publish with auto-translate OFF → mark-stale", () => {
		const result = decideTranslationAction({
			doc: makeDoc({ autoTranslate: false }),
			previousDoc: makeDoc({ _status: "draft" }),
			context: {},
		});
		expect(result).toBe("mark-stale");
	});

	test("format-only change with auto-translate ON → format-sync", () => {
		// Same plain text, different structure (bold added)
		const formatted = makeRichText(para("Hello world", "bold"));
		const result = decideTranslationAction({
			doc: makeDoc({ reviewContent: formatted }),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("format-sync");
	});

	test("format-only change with auto-translate OFF → none", () => {
		const formatted = makeRichText(para("Hello world", "bold"));
		const result = decideTranslationAction({
			doc: makeDoc({ autoTranslate: false, reviewContent: formatted }),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("auto-translate OFF, English newer than translation → mark-stale (real stale)", () => {
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				englishUpdatedAt: "2026-01-02T00:00:00.000Z",
				translationUpdatedAt: "2026-01-01T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("mark-stale");
	});

	test("auto-translate OFF, translation up to date → none", () => {
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				englishUpdatedAt: "2026-01-01T00:00:00.000Z",
				translationUpdatedAt: "2026-01-01T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("saving only the schedule → none (a publishAt edit starts no translation)", () => {
		// Scheduling is not an English change: the content is untouched, so
		// setting, moving or clearing `publishAt` must leave the translation
		// pipeline alone (`FR-9`, `AC-9`). The review is otherwise identical
		// and already translated.
		const result = decideTranslationAction({
			doc: makeDoc({
				publishAt: "2030-01-01T00:00:00.000Z",
				englishUpdatedAt: "2026-01-01T00:00:00.000Z",
				translationUpdatedAt: "2026-01-01T00:00:00.000Z",
			}),
			previousDoc: makeDoc({
				publishAt: null,
				englishUpdatedAt: "2026-01-01T00:00:00.000Z",
				translationUpdatedAt: "2026-01-01T00:00:00.000Z",
			}),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("auto-translate OFF, stale dates but status failed → none (failed → stale is illegal)", () => {
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				translationStatus: "failed",
				englishUpdatedAt: "2026-01-02T00:00:00.000Z",
				translationUpdatedAt: "2026-01-01T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("auto-translate OFF, document updatedAt newer than the translation → none (the document timestamp is not a staleness signal)", () => {
		// The document's `updatedAt` is restamped by every write — including
		// the pipeline's own translation write — so it must not decide
		// staleness. The English content's change time does.
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				updatedAt: "2026-01-05T00:00:00.000Z",
				englishUpdatedAt: "2026-01-01T00:00:00.000Z",
				translationUpdatedAt: "2026-01-02T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("auto-translate OFF, legacy review without an English change time → none", () => {
		// The English change time was never recorded for this review, so its
		// staleness cannot be established: it keeps its current status.
		const result = decideTranslationAction({
			doc: makeDoc({
				autoTranslate: false,
				translationUpdatedAt: "2026-01-02T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});

	test("nothing changed → none", () => {
		const result = decideTranslationAction({
			doc: makeDoc(),
			previousDoc: makeDoc(),
			context: {},
		});
		expect(result).toBe("none");
	});
});

describe("runTranslationPipeline", () => {
	let runTranslationPipeline: TranslateReviewModule["runTranslationPipeline"];

	let translateRichTextSpy: TranslateRichTextSpy;
	let translateTextSpy: TranslateTextSpy;
	let redisSpy: ReturnType<typeof spyOn<typeof redisModule, "getRedisClient">>;

	beforeEach(async () => {
		const mod = await import("../translateReview");
		runTranslationPipeline = mod.runTranslationPipeline;
		// Force the in-memory lock fallback so pipeline tests are
		// deterministic without a live Redis (mirrors redis-less environments).
		redisSpy = spyOn(redisModule, "getRedisClient").mockReturnValue(null);
	});

	afterEach(() => {
		translateRichTextSpy?.mockRestore();
		translateTextSpy?.mockRestore();
		redisSpy?.mockRestore();
	});

	test("pending → translated: updates status then saves ID content with translated text", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async (rt: RichTextDocument | null | undefined) =>
			makeRichText(
				// Safe cast: the pipeline passes doc.reviewContent straight through,
				// and makeDoc builds that field with makeRichText, whose shape is
				// exactly this fixture's RichText type (RichTextDocument keeps the
				// traversed fields `unknown`).
				para(`ID:${(rt as RichText).root.children[0].children[0].text}`),
			),
		);
		translateTextSpy = spyOn(
			translateModule,
			"translateText",
		).mockImplementation(async (t: string) => `ID:${t}`);

		const doc = makeDoc({
			favoriteQuotes: [{ quote: "A fine line", page: "12" }],
		});

		// Partial Payload stub: the full Payload interface is impractical to
		// implement in a unit test, so the mock is widened at the call boundary.
		await runTranslationPipeline(payload as unknown as Payload, doc);

		// First update: pending
		const firstCall = payload.update.mock.calls[0][0];
		expect(firstCall.data.translationStatus).toBe("pending");
		expect(firstCall.context.skipTranslation).toBe(true);

		// Second update: ID locale content + translated status
		const secondCall = payload.update.mock.calls[1][0];
		expect(secondCall.collection).toBe("reviews");
		expect(secondCall.id).toBe(1);
		expect(secondCall.locale).toBe("id");
		expect(secondCall.context.skipTranslation).toBe(true);
		expect(secondCall.data.translationStatus).toBe("translated");
		expect(secondCall.data.translationUpdatedAt).toBeTruthy();
		// Explicit guard: with reviewContent optional on the mock type, fail
		// loudly here rather than dereferencing a possibly-undefined value.
		const translatedContent = secondCall.data.reviewContent;
		if (!translatedContent) {
			throw new Error(
				"expected second update to include translated reviewContent",
			);
		}
		expect(translatedContent.root.children[0].children[0].text).toBe(
			"ID:Hello world",
		);
		expect(secondCall.data.favoriteQuotes[0].quote).toBe("ID:A fine line");
		expect(secondCall.data.favoriteQuotes[0].page).toBe("12");
	});

	test("failure → ID content NOT updated, status failed with error message", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			const { TranslationError } = await import("../../lib/translate");
			throw new TranslationError("API down", { attempts: 3 });
		});

		const doc = makeDoc();

		await runTranslationPipeline(payload as unknown as Payload, doc);

		// Only the "pending" update happened — no ID content update.
		// (The status update carries no locale: status fields are non-localized.)
		expect(payload.update.mock.calls.length).toBe(2);
		const finalCall = payload.update.mock.calls[1][0];
		expect(finalCall.data.translationStatus).toBe("failed");
		expect(finalCall.data.translationError).toContain("API down");
		expect(finalCall.data.translationUpdatedAt).toBeTruthy();
		// No English fallback: translated rich text fields must not be present
		expect(finalCall.data.reviewContent).toBeUndefined();
		expect(finalCall.data.favoriteQuotes).toBeUndefined();
	});

	test("second concurrent trigger while pipeline is running → silent no-op (per-review lock)", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");

		let release!: () => void;
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return makeRichText(para("ID:Hello world"));
		});
		translateTextSpy = spyOn(
			translateModule,
			"translateText",
		).mockImplementation(async (t: string) => `ID:${t}`);

		const doc = makeDoc();
		const run1 = runTranslationPipeline(payload as unknown as Payload, doc);
		const run2 = runTranslationPipeline(payload as unknown as Payload, doc);

		// Let run1 reach the blocked translation step.
		await new Promise((resolve) => setTimeout(resolve, 5));

		// Exactly one pipeline is running: only run1's pending update exists.
		expect(payload.update.mock.calls.length).toBe(1);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);

		release();
		await Promise.all([run1, run2]);

		// run1 completed normally; run2 added nothing.
		expect(payload.update.mock.calls.length).toBe(2);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
	});

	test("lock is released on failure — a later run can acquire it", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			const { TranslationError } = await import("../../lib/translate");
			throw new TranslationError("API down", { attempts: 3 });
		});

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			retryDelayMs: 1,
		});
		expect(payload.update.mock.calls.length).toBe(2);

		// The failed run released the lock: a fresh run acquires and proceeds.
		await runTranslationPipeline(payload as unknown as Payload, doc);
		expect(payload.update.mock.calls.length).toBe(4);
		expect(payload.update.mock.calls[3][0].data.translationStatus).toBe(
			"failed",
		);
	});

	test("transient failure → exactly one delayed re-run, then failed stays", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			const { TranslationError } = await import("../../lib/translate");
			throw new TranslationError("Translation failed after 3 attempts", {
				attempts: 3,
				cause: new Error("quota exceeded"),
			});
		});

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			retryDelayMs: 1,
		});

		// First run recorded the failure.
		expect(payload.update.mock.calls.length).toBe(2);
		expect(payload.update.mock.calls[1][0].data.translationStatus).toBe(
			"failed",
		);
		expect(payload.update.mock.calls[1][0].data.translationError).toContain(
			"(raw: Translation failed after 3 attempts: quota exceeded)",
		);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);

		// The scheduled re-run fires and fails again → failed again.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(4);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(2);
		expect(payload.update.mock.calls[3][0].data.translationStatus).toBe(
			"failed",
		);

		// No further automatic re-runs after the retry failed.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(4);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(2);
	});

	test("permanent failure (credentials) → immediate failed, no re-run", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			throw new Error(
				"invalid credentials: Could not load the default credentials",
			);
		});

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			retryDelayMs: 1,
		});

		expect(payload.update.mock.calls.length).toBe(2);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
		const finalCall = payload.update.mock.calls[1][0];
		expect(finalCall.data.translationStatus).toBe("failed");
		expect(finalCall.data.translationError).toContain("credentials");
		expect(finalCall.data.translationError).toContain(
			"(raw: invalid credentials",
		);

		// No automatic re-run was scheduled.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(2);
	});

	test("a run whose deadline has passed stops before translating", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => makeRichText(para("ID:Hello world")));

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			deadline: Date.now() - 1,
			retryDelayMs: 1,
		});

		// The budget stopped the run before the first translation.
		expect(translateRichTextSpy).not.toHaveBeenCalled();
		expect(payload.update.mock.calls.length).toBe(2);
		const finalCall = payload.update.mock.calls[1][0];
		expect(finalCall.data.translationStatus).toBe("failed");
		expect(finalCall.data.translationError).toBe(
			"translation time budget reached",
		);

		// A budget stop is not a transient provider failure: no re-run.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(2);
	});

	test("a quota failure that arrives after the deadline is still a quota failure and still schedules the re-run", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		let calls = 0;
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => {
			calls += 1;
			if (calls === 1) {
				// The provider fails only after the deadline has passed.
				await new Promise((resolve) => setTimeout(resolve, 400));
			}
			const { TranslationError } = await import("../../lib/translate");
			throw new TranslationError("Quota exceeded for quota project", {
				attempts: 1,
				cause: new Error("Quota exceeded for quota project"),
			});
		});

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			deadline: Date.now() + 300,
			retryDelayMs: 1,
		});

		// The provider failure is recorded as itself — the deadline must not
		// turn it into a budget stop, which would lose the actionable message.
		expect(payload.update.mock.calls.length).toBe(2);
		const finalCall = payload.update.mock.calls[1][0];
		expect(finalCall.data.translationStatus).toBe("failed");
		expect(finalCall.data.translationError).toContain("quota");
		expect(finalCall.data.translationError).toContain(
			"(raw: Quota exceeded for quota project)",
		);
		expect(finalCall.data.translationError).not.toContain(
			"translation time budget reached",
		);

		// The quota failure is transient: the single automatic delayed re-run
		// is scheduled even though the deadline had passed.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(4);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(2);

		// The re-run failed too, and it does not schedule a further re-run.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(payload.update.mock.calls.length).toBe(4);
	});

	test("the guard skips the run when the review no longer exists", async () => {
		const payload = makePayload();
		payload.findByID.mockImplementation(async () => {
			throw Object.assign(new Error("Not Found"), {
				status: 404,
				name: "NotFound",
			});
		});
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => makeRichText(para("ID:Hello world")));

		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			abortIfTranslationNewerThan: new Date().toISOString(),
		});

		// The deleted review is skipped, not translated: nothing was written.
		expect(payload.update).not.toHaveBeenCalled();
		expect(translateRichTextSpy).not.toHaveBeenCalled();
	});

	test("the remaining time is passed to the translation layer", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		const seen: { timeoutMs?: number; deadline?: number }[] = [];
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async (rt, _target, options) => {
			seen.push(options ?? {});
			return makeRichText(
				para(`ID:${(rt as RichText).root.children[0].children[0].text}`),
			);
		});

		const deadline = Date.now() + 5000;
		const doc = makeDoc();
		await runTranslationPipeline(payload as unknown as Payload, doc, {
			deadline,
		});

		expect(seen.length).toBeGreaterThan(0);
		expect(seen[0].deadline).toBe(deadline);
		expect(typeof seen[0].timeoutMs).toBe("number");
	});
});

describe("delayed re-run (F2)", () => {
	let runTranslationPipeline: TranslateReviewModule["runTranslationPipeline"];

	let translateRichTextSpy: TranslateRichTextSpy;
	let translateTextSpy: TranslateTextSpy;
	let redisSpy: ReturnType<typeof spyOn<typeof redisModule, "getRedisClient">>;

	beforeEach(async () => {
		const mod = await import("../translateReview");
		runTranslationPipeline = mod.runTranslationPipeline;
		redisSpy = spyOn(redisModule, "getRedisClient").mockReturnValue(null);
	});

	afterEach(() => {
		translateRichTextSpy?.mockRestore();
		translateTextSpy?.mockRestore();
		redisSpy?.mockRestore();
	});

	/** Fail the first translation attempt, succeed on every later one. */
	function failFirstAttempt(): void {
		let attempts = 0;
		translateRichTextSpy = spyOn(
			translateModuleRef,
			"translateRichText",
		).mockImplementation(async () => {
			attempts += 1;
			if (attempts === 1) {
				throw new translateModuleRef.TranslationError(
					"Translation failed after 3 attempts",
					{ attempts: 3, cause: new Error("quota exceeded") },
				);
			}
			return makeRichText(para("ID:translated"));
		});
		translateTextSpy = spyOn(
			translateModuleRef,
			"translateText",
		).mockImplementation(async (t: string) => `ID:${t}`);
	}

	// The translate module is imported lazily so the @google-cloud/translate
	// stub is registered first (see the mock.module call at the top).
	let translateModuleRef: TranslateModule;

	beforeEach(async () => {
		translateModuleRef = await import("../../lib/translate");
	});

	test("a newer translation survives the delayed re-run", async () => {
		failFirstAttempt();
		const { payload, state } = makeStatefulPayload(makeDoc());

		await runTranslationPipeline(payload as unknown as Payload, state.doc, {
			retryDelayMs: 1,
		});

		// A second run succeeds with changed content while the retry waits.
		state.doc = {
			...state.doc,
			reviewContent: makeRichText(para("New text")),
			translationStatus: "translated",
			translationUpdatedAt: new Date(Date.now() + 1000).toISOString(),
		};
		const callsBeforeRetry = payload.update.mock.calls.length;

		await new Promise((resolve) => setTimeout(resolve, 50));

		// The re-run re-read the review, saw the newer translation, and
		// skipped: nothing was overwritten and no second run happened.
		expect(payload.update.mock.calls.length).toBe(callsBeforeRetry);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
		expect(state.doc.translationStatus).toBe("translated");
		const freshContent = state.doc.reviewContent as unknown as RichText;
		expect(freshContent.root.children[0].children[0].text).toBe("New text");
	});

	test("the delayed re-run translates the fresh content", async () => {
		failFirstAttempt();
		const { payload, state } = makeStatefulPayload(makeDoc());

		await runTranslationPipeline(payload as unknown as Payload, state.doc, {
			retryDelayMs: 1,
		});

		// The review was edited (but not re-translated) inside the retry
		// window: the re-run must translate the new content, not the
		// snapshot taken at failure time.
		state.doc = {
			...state.doc,
			reviewContent: makeRichText(para("New text")),
		};

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(translateRichTextSpy).toHaveBeenCalledTimes(2);
		const retried = translateRichTextSpy.mock.calls[1][0] as RichText;
		expect(retried.root.children[0].children[0].text).toBe("New text");
	});

	test("no re-run when the review was unpublished in the meantime", async () => {
		failFirstAttempt();
		const { payload, state } = makeStatefulPayload(makeDoc());

		await runTranslationPipeline(payload as unknown as Payload, state.doc, {
			retryDelayMs: 1,
		});
		expect(payload.update.mock.calls.length).toBe(2);

		state.doc = { ...state.doc, _status: "draft" };

		await new Promise((resolve) => setTimeout(resolve, 50));

		// The unpublished review is not re-translated.
		expect(payload.update.mock.calls.length).toBe(2);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
	});

	test("no re-run when the review was deleted in the meantime", async () => {
		failFirstAttempt();
		const { payload, state } = makeStatefulPayload(makeDoc());

		await runTranslationPipeline(payload as unknown as Payload, state.doc, {
			retryDelayMs: 1,
		});
		expect(payload.update.mock.calls.length).toBe(2);

		payload.findByID.mockImplementation(async () => {
			throw Object.assign(new Error("Not Found"), {
				status: 404,
				name: "NotFound",
			});
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(payload.update.mock.calls.length).toBe(2);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
	});

	test("a translation that lands between the re-read and the write survives", async () => {
		failFirstAttempt();
		const { payload, state } = makeStatefulPayload(makeDoc());

		await runTranslationPipeline(payload as unknown as Payload, state.doc, {
			retryDelayMs: 1,
		});
		expect(payload.update.mock.calls.length).toBe(2);

		// The first read — the delayed re-run's own check — sees no newer
		// translation, so the re-run starts. The second read — the guard,
		// taken after the lock — sees a translation that landed in between.
		const newer: Review = {
			...state.doc,
			translationStatus: "translated",
			translationUpdatedAt: new Date(Date.now() + 60_000).toISOString(),
		};
		let reads = 0;
		payload.findByID.mockImplementation(async () => {
			reads += 1;
			return reads === 1 ? state.doc : newer;
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		// The re-run re-read the review under the lock, saw the newer
		// translation and stopped: nothing was overwritten, nothing was
		// translated a second time.
		expect(reads).toBe(2);
		expect(payload.update.mock.calls.length).toBe(2);
		expect(translateRichTextSpy).toHaveBeenCalledTimes(1);
	});
});

describe("recordEnglishChangeTime (F1: English change time)", () => {
	let recordEnglishChangeTime: TranslateReviewModule["recordEnglishChangeTime"];
	let englishContentChanged: TranslateReviewModule["englishContentChanged"];

	beforeEach(async () => {
		const mod = await import("../translateReview");
		recordEnglishChangeTime = mod.recordEnglishChangeTime;
		englishContentChanged = mod.englishContentChanged;
	});

	/** A request whose locale and default locale are the given ones. */
	function makeReq(locale?: string) {
		return {
			locale,
			payload: { config: { localization: { defaultLocale: "en" } } },
		} as unknown as Parameters<typeof recordEnglishChangeTime>[0]["req"];
	}

	/**
	 * Run the beforeChange hook and return the incoming data it wrote to.
	 * The hook writes the change time into the data instead of performing a
	 * nested write: the save's own transaction carries it.
	 */
	function runBeforeChange({
		data,
		operation = "update",
		originalDoc,
		locale,
	}: {
		data: Partial<Review>;
		operation?: "create" | "update";
		originalDoc?: Review;
		locale?: string;
	}): Partial<Review> {
		recordEnglishChangeTime({
			data,
			operation,
			originalDoc,
			req: makeReq(locale),
			collection: {} as never,
			context: {},
		});
		return data;
	}

	test("an English text edit stamps the change time into the incoming data", () => {
		const data = runBeforeChange({
			data: { reviewContent: makeRichText(para("Changed text")) },
			originalDoc: makeDoc(),
		});

		expect(typeof data.englishUpdatedAt).toBe("string");
	});

	test("a format-only change does not stamp the change time", () => {
		const data = runBeforeChange({
			data: { reviewContent: makeRichText(para("Hello world", "bold")) },
			originalDoc: makeDoc(),
		});

		expect(data.englishUpdatedAt).toBeUndefined();
	});

	test("a write without a rich-text field does not stamp the change time", () => {
		const data = runBeforeChange({
			data: { translationStatus: "pending" },
			originalDoc: makeDoc(),
		});

		expect(data.englishUpdatedAt).toBeUndefined();
	});

	test("a write against another locale does not stamp the change time", () => {
		const data = runBeforeChange({
			data: { reviewContent: makeRichText(para("Changed text")) },
			originalDoc: makeDoc(),
			locale: "id",
		});

		expect(data.englishUpdatedAt).toBeUndefined();
	});

	test("a create stamps the change time", () => {
		const data = runBeforeChange({
			data: { reviewContent: makeRichText(para("Hello world")) },
			operation: "create",
		});

		expect(typeof data.englishUpdatedAt).toBe("string");
	});

	test("englishContentChanged compares plain text, not markup", () => {
		expect(
			englishContentChanged({
				next: { reviewContent: makeRichText(para("Changed text")) },
				previous: makeDoc(),
			}),
		).toBe(true);
		expect(
			englishContentChanged({
				next: { reviewContent: makeRichText(para("Hello world", "bold")) },
				previous: makeDoc(),
			}),
		).toBe(false);
		expect(
			englishContentChanged({
				next: { translationStatus: "pending" },
				previous: makeDoc(),
			}),
		).toBe(false);
	});
});

describe("translateReview hook (F1: no nested write)", () => {
	let translateReview: TranslateReviewModule["translateReview"];
	let redisSpy: ReturnType<typeof spyOn<typeof redisModule, "getRedisClient">>;
	let translateRichTextSpy: TranslateRichTextSpy;
	let translateTextSpy: TranslateTextSpy;

	beforeEach(async () => {
		const mod = await import("../translateReview");
		translateReview = mod.translateReview;
		redisSpy = spyOn(redisModule, "getRedisClient").mockReturnValue(null);
		// Stub the translation layer: the real one would create the
		// memoized Google client and bind it to this file's module mock.
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async () => makeRichText(para("ID:translated")));
		translateTextSpy = spyOn(
			translateModule,
			"translateText",
		).mockImplementation(async (t: string) => `ID:${t}`);
	});

	afterEach(() => {
		translateRichTextSpy?.mockRestore();
		translateTextSpy?.mockRestore();
		redisSpy?.mockRestore();
	});

	/** Run the afterChange hook with a mocked Payload. */
	async function runHook({
		doc,
		previousDoc,
		payload,
	}: {
		doc: Review;
		previousDoc: Review;
		payload: ReturnType<typeof makePayload>;
	}): Promise<void> {
		await translateReview({
			doc,
			previousDoc,
			req: { payload },
			context: {},
		} as unknown as Parameters<typeof translateReview>[0]);
		// Let the (deliberately non-blocking) pipeline writes land.
		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	test("a text change starts the pipeline without a nested write", async () => {
		const payload = makePayload();
		await runHook({
			doc: makeDoc({ reviewContent: makeRichText(para("Changed text")) }),
			previousDoc: makeDoc(),
			payload,
		});

		// The English change time is not written by a nested update: it is
		// written by the beforeChange hook, in the save's own transaction.
		for (const call of payload.update.mock.calls) {
			expect(call[0].data.englishUpdatedAt).toBeUndefined();
		}
		// No nested write against the English locale either.
		for (const call of payload.update.mock.calls) {
			expect(call[0].locale).not.toBe("en");
		}
		// The pipeline itself ran.
		expect(payload.update.mock.calls.length).toBeGreaterThan(0);
		expect(payload.update.mock.calls[0][0].data.translationStatus).toBe(
			"pending",
		);
	});

	test("the hook resolves while the write it triggered is still pending", async () => {
		// A nested awaited write would wait for the row lock the outer
		// transaction holds and deadlock the save: the hook must resolve
		// without waiting for its own write.
		const payload = makePayload();
		let releaseWrite!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseWrite = resolve;
		});
		payload.update.mockImplementation(async () => {
			await gate;
			return {};
		});

		const doc = makeDoc({
			id: 4242,
			reviewContent: makeRichText(para("Changed text")),
		});

		await Promise.race([
			translateReview({
				doc,
				previousDoc: makeDoc(),
				req: { payload },
				context: {},
			} as unknown as Parameters<typeof translateReview>[0]),
			new Promise((_, reject) =>
				setTimeout(
					() =>
						reject(new Error("the afterChange hook awaited a nested write")),
					500,
				),
			),
		]);

		// Let the pipeline finish so it releases the per-review lock.
		releaseWrite();
		await new Promise((resolve) => setTimeout(resolve, 10));
	});

	test("a format-only change does not write the English change time", async () => {
		const payload = makePayload();
		await runHook({
			doc: makeDoc({
				reviewContent: makeRichText(para("Hello world", "bold")),
			}),
			previousDoc: makeDoc(),
			payload,
		});

		for (const call of payload.update.mock.calls) {
			expect(call[0].data.englishUpdatedAt).toBeUndefined();
		}
	});

	test("re-marking a stale translation does not write the English change time", async () => {
		const payload = makePayload();
		await runHook({
			doc: makeDoc({
				autoTranslate: false,
				translationStatus: "translated",
				englishUpdatedAt: "2026-01-03T00:00:00.000Z",
				translationUpdatedAt: "2026-01-02T00:00:00.000Z",
			}),
			previousDoc: makeDoc(),
			payload,
		});

		for (const call of payload.update.mock.calls) {
			expect(call[0].data.englishUpdatedAt).toBeUndefined();
		}
	});
});
