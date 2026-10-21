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
		reviewContent: RichText;
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

/** Minimal mocked Payload Local API. */
function makePayload() {
	return {
		update: mock(async (_args: UpdateArgs) => ({})),
		findByID: mock(async (_args: { collection: string; id: number }) => ({})),
	};
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

	beforeEach(async () => {
		const mod = await import("../translateReview");
		runTranslationPipeline = mod.runTranslationPipeline;
	});

	afterEach(() => {
		translateRichTextSpy?.mockRestore();
		translateTextSpy?.mockRestore();
	});

	test("pending → translated: updates status then saves ID content with translated text", async () => {
		const payload = makePayload();
		const translateModule = await import("../../lib/translate");
		translateRichTextSpy = spyOn(
			translateModule,
			"translateRichText",
		).mockImplementation(async (rt: RichTextDocument | null | undefined) =>
			makeRichText(
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
		expect(
			secondCall.data.reviewContent.root.children[0].children[0].text,
		).toBe("ID:Hello world");
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
});
