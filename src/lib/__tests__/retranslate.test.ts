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
// Mock the Google Translate SDK before any module under test loads (see
// translate-batch.test.ts for precedent). The echo translator mirrors the SDK
// v2 tuple response shape: [translations, metadata].
// ---------------------------------------------------------------------------

type TranslateMock = (
	texts: string | string[],
	target?: string,
) => Promise<[string[]]>;

const echoTranslate = (texts: string | string[]): Promise<[string[]]> =>
	Promise.resolve([
		(Array.isArray(texts) ? texts : [texts]).map((t) => `ID:${t}`),
	]);

const mockClientTranslate: TranslateMock = mock(echoTranslate);

mock.module("@google-cloud/translate", () => ({
	v2: {
		Translate: class {
			translate = mockClientTranslate;
		},
	},
}));

// ---------------------------------------------------------------------------

describe("retranslateReview", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let retranslateReview: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let pipelineSpy: any;

	// Minimal mocked Payload Local API
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const makePayload = (doc: any, updatedDoc?: any) => {
		const findByID = mock(async () => {
			// Bun records the call before executing: 1st call → doc, later → updatedDoc
			return findByID.mock.calls.length <= 1 ? doc : updatedDoc;
		});
		return {
			findByID,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			update: mock(async (_args: any) => ({})),
		};
	};

	/** Review doc fixture: author 7 owns it; auto-translate toggle configurable. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const makeDoc = (overrides: Record<string, any> = {}) => ({
		id: 1,
		title: "A Great Book",
		_status: "draft",
		author: 7,
		autoTranslate: true,
		translationStatus: "stale",
		...overrides,
	});

	beforeEach(async () => {
		const mod = await import("../retranslate");
		retranslateReview = mod.retranslateReview;
		const hooksMod = await import("../../hooks/translateReview");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		pipelineSpy = spyOn(
			hooksMod as any,
			"runTranslationPipeline",
		).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async (payload: any) => {
				await payload.update({
					collection: "reviews",
					id: 1,
					data: { translationStatus: "translated" },
				});
			},
		);
	});

	afterEach(() => {
		pipelineSpy?.mockRestore();
	});

	test("no user → 401, pipeline never runs", async () => {
		const doc = makeDoc();
		const payload = makePayload(doc);

		const result = await retranslateReview(payload, null, 1);

		expect(result.ok).toBe(false);
		expect(result.httpStatus).toBe(401);
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	test("writer who does not own the review → 403, pipeline never runs", async () => {
		const doc = makeDoc(); // author 7
		const payload = makePayload(doc);
		const user = { id: 9, role: "writer" };

		const result = await retranslateReview(payload, user, 1);

		expect(result.ok).toBe(false);
		expect(result.httpStatus).toBe(403);
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	test("writer who owns the review → runs pipeline (works on drafts)", async () => {
		const doc = makeDoc({ _status: "draft" });
		const updated = makeDoc({ translationStatus: "translated" });
		const payload = makePayload(doc, updated);
		const user = { id: 7, role: "writer" };

		const result = await retranslateReview(payload, user, 1);

		expect(result.ok).toBe(true);
		expect(result.httpStatus).toBe(200);
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(result.translationStatus).toBe("translated");
	});

	test("admin → runs pipeline regardless of author", async () => {
		const doc = makeDoc(); // author 7, user is admin id 9
		const updated = makeDoc({ translationStatus: "translated" });
		const payload = makePayload(doc, updated);
		const user = { id: 9, role: "admin" };

		const result = await retranslateReview(payload, user, 1);

		expect(result.ok).toBe(true);
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
	});

	test("explicit action overrides autoTranslate=false", async () => {
		const doc = makeDoc({ autoTranslate: false });
		const updated = makeDoc({
			autoTranslate: false,
			translationStatus: "translated",
		});
		const payload = makePayload(doc, updated);
		const user = { id: 7, role: "writer" };

		const result = await retranslateReview(payload, user, 1);

		expect(result.ok).toBe(true);
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(result.translationStatus).toBe("translated");
	});

	test("reports failed status with error message when pipeline marked failure", async () => {
		const doc = makeDoc();
		const updated = makeDoc({
			translationStatus: "failed",
			translationError: "API down (after 3 attempts)",
		});
		const payload = makePayload(doc, updated);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		pipelineSpy.mockImplementation(async () => {});
		const user = { id: 7, role: "writer" };

		const result = await retranslateReview(payload, user, 1);

		// The request itself succeeds; the outcome is reported via status
		expect(result.ok).toBe(true);
		expect(result.translationStatus).toBe("failed");
		expect(result.error).toContain("API down");
	});

	test("missing review → 404", async () => {
		const payload = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			findByID: mock(async (_args: any) => {
				throw new Error("Not Found");
			}),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			update: mock(async (_args: any) => ({})),
		};
		const user = { id: 7, role: "writer" };

		const result = await retranslateReview(payload, user, 999);

		expect(result.ok).toBe(false);
		expect(result.httpStatus).toBe(404);
		expect(pipelineSpy).not.toHaveBeenCalled();
	});
});
