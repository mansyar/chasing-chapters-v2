import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TextNode = { type: "text"; text: string };
type ParagraphNode = {
	type: "paragraph";
	format?: string;
	children: (TextNode | { type: "linebreak" })[];
};
type RichText = { root: { type: "root"; children: ParagraphNode[] } };

function makeRichText(...paragraphs: ParagraphNode[]): RichText {
	return { root: { type: "root", children: paragraphs } };
}

function para(text: string, format?: string): ParagraphNode {
	return {
		type: "paragraph",
		...(format ? { format } : {}),
		children: [{ type: "text", text }],
	};
}

/** Minimal review-shaped doc for decision + pipeline tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDoc(overrides: Record<string, any> = {}): Record<string, any> {
	return {
		id: 1,
		title: "A Great Book",
		_status: "published",
		autoTranslate: true,
		reviewContent: makeRichText(para("Hello world")),
		whatILoved: null,
		whatCouldBeBetter: null,
		perfectFor: null,
		favoriteQuotes: null,
		translationStatus: "translated",
		...overrides,
	};
}

/** Minimal mocked Payload Local API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePayload(): { update: any; findByID: any } {
	return {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		update: mock(async (_args: any) => ({})),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		findByID: mock(async (_args: any) => ({})),
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let decideTranslationAction: any;

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let runTranslationPipeline: any;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let translateRichTextSpy: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let translateTextSpy: any;

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
		translateRichTextSpy = spyOn(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(await import("../../lib/translate")) as any,
			"translateRichText",
		).mockImplementation(async (rt: RichText) =>
			makeRichText(
				para(`ID:${(rt.root.children[0].children[0] as TextNode).text}`),
			),
		);
		translateTextSpy = spyOn(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(await import("../../lib/translate")) as any,
			"translateText",
		).mockImplementation(async (t: string) => `ID:${t}`);

		const doc = makeDoc({
			favoriteQuotes: [{ quote: "A fine line", page: "12" }],
		});

		await runTranslationPipeline(payload, doc);

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
		translateRichTextSpy = spyOn(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(await import("../../lib/translate")) as any,
			"translateRichText",
		).mockImplementation(async () => {
			const { TranslationError } = await import("../../lib/translate");
			throw new TranslationError("API down", { attempts: 3 });
		});

		const doc = makeDoc();

		await runTranslationPipeline(payload, doc);

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
