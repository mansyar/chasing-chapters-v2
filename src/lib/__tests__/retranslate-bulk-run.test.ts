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
import type { Payload, TypedUser } from "payload";
import type { Review } from "../../payload-types";

// ---------------------------------------------------------------------------
// Mock the Google Translate SDK before any module under test loads (see
// retranslate.test.ts for precedent).
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

type HooksModule = typeof import("../../hooks/translateReview");
type LockModule = typeof import("../translation-lock");

type PipelineSpy = ReturnType<
	typeof spyOn<HooksModule, "runTranslationPipeline">
>;

describe("bulk re-translate run (FR-4)", () => {
	let retranslateReviews: typeof import("../retranslate").retranslateReviews;
	let pipelineSpy: PipelineSpy;
	let lockSpy: ReturnType<typeof spyOn<LockModule, "isTranslationLocked">>;

	/** Review doc fixture: author 7 owns it. */
	const makeDoc = (overrides: Partial<Review> = {}): Review =>
		({
			id: 1,
			title: "A Great Book",
			bookAuthor: "Some Author",
			rating: 5,
			coverImage: 1,
			author: 7,
			reviewContent: {
				root: {
					type: "root",
					children: [],
					direction: null,
					format: "",
					indent: 0,
					version: 1,
				},
			},
			autoTranslate: true,
			translationStatus: "failed",
			updatedAt: "2026-01-01T00:00:00.000Z",
			createdAt: "2026-01-01T00:00:00.000Z",
			_status: "draft",
			...overrides,
		}) as Review;

	const writer: TypedUser = {
		id: 7,
		name: "Writer",
		role: "writer",
		email: "writer@example.com",
		updatedAt: "2026-01-01T00:00:00.000Z",
		createdAt: "2026-01-01T00:00:00.000Z",
		collection: "authors",
	};

	/** Docs the mocked payload knows about, keyed by id. */
	let docs: Map<number, Review>;
	/** Ids the mocked access rules let this user reach. */
	let accessible: Set<number>;
	/** Order in which the pipeline ran, to prove sequential execution. */
	let events: string[];

	const makePayload = (): Payload => {
		const findByID = mock(
			async (args: { id: number; overrideAccess?: boolean }) => {
				if (args.overrideAccess === false && !accessible.has(args.id)) {
					throw Object.assign(new Error("Not Found"), {
						status: 404,
						name: "NotFound",
					});
				}
				const doc = docs.get(args.id);
				if (!doc) {
					throw Object.assign(new Error("Not Found"), {
						status: 404,
						name: "NotFound",
					});
				}
				return doc;
			},
		);
		return {
			findByID,
			update: mock(async (_args: { collection: string; id: number }) => ({})),
		} as unknown as Payload;
	};

	beforeEach(async () => {
		const mod = await import("../retranslate");
		retranslateReviews = mod.retranslateReviews;
		const hooksMod = await import("../../hooks/translateReview");
		pipelineSpy = spyOn(hooksMod, "runTranslationPipeline").mockImplementation(
			async (_payload: Payload, doc: Review) => {
				events.push(`start:${doc.id}`);
				// A real pipeline awaits I/O between its start and its end, so
				// a parallel implementation would interleave the events.
				await new Promise((resolve) => setTimeout(resolve, 0));
				const current = docs.get(doc.id);
				if (current) {
					docs.set(doc.id, {
						...current,
						translationStatus: "translated",
					});
				}
				events.push(`end:${doc.id}`);
			},
		);
		const lockMod = await import("../translation-lock");
		lockSpy = spyOn(lockMod, "isTranslationLocked").mockImplementation(
			async () => false,
		);
		docs = new Map();
		accessible = new Set();
		events = [];
	});

	afterEach(() => {
		pipelineSpy?.mockRestore();
		lockSpy?.mockRestore();
	});

	test("re-translates failed and stale reviews and reports each outcome", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "stale" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();

		const outcomes = await retranslateReviews(payload, writer, [1, 2]);

		expect(outcomes).toHaveLength(2);
		expect(outcomes[0]).toMatchObject({
			id: 1,
			status: "translated",
			translationStatus: "translated",
		});
		expect(outcomes[1]).toMatchObject({
			id: 2,
			status: "translated",
			translationStatus: "translated",
		});
	});

	test("runs the reviews one after the other", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();

		await retranslateReviews(payload, writer, [1, 2]);

		expect(events).toEqual(["start:1", "end:1", "start:2", "end:2"]);
	});

	test("skips reviews whose translation does not need a re-run", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "translated" }));
		accessible.add(1);
		const payload = makePayload();

		const outcomes = await retranslateReviews(payload, writer, [1]);

		expect(outcomes[0].status).toBe("skipped");
		expect(outcomes[0].reason).toContain("translated");
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	test("skips reviews the user may not access", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		// id 1 is not accessible to this writer
		const payload = makePayload();

		const outcomes = await retranslateReviews(payload, writer, [1]);

		expect(outcomes[0].status).toBe("skipped");
		expect(outcomes[0].reason).toContain("not accessible");
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	test("skips a review whose translation is already running", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		accessible.add(1);
		const payload = makePayload();
		lockSpy.mockImplementation(async () => true);

		const outcomes = await retranslateReviews(payload, writer, [1]);

		expect(outcomes[0].status).toBe("skipped");
		expect(outcomes[0].reason).toContain("already in progress");
		expect(pipelineSpy).not.toHaveBeenCalled();
	});

	test("reports a failed translation as failed", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		accessible.add(1);
		const payload = makePayload();
		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			const current = docs.get(doc.id);
			if (current) {
				docs.set(doc.id, {
					...current,
					translationStatus: "failed",
					translationError: "Quota exceeded, try again later.",
				});
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1]);

		expect(outcomes[0].status).toBe("failed");
		expect(outcomes[0].reason).toContain("Quota exceeded");
	});

	test("one failing review does not abort the batch", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();
		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			if (doc.id === 1) throw new Error("boom");
			const current = docs.get(doc.id);
			if (current) {
				docs.set(doc.id, { ...current, translationStatus: "translated" });
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2]);

		expect(outcomes).toHaveLength(2);
		expect(outcomes[0].status).toBe("failed");
		expect(outcomes[0].reason).toContain("boom");
		expect(outcomes[1].status).toBe("translated");
	});
});
