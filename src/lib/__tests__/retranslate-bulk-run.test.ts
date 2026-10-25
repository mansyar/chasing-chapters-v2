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
	let budgetSpy: ReturnType<
		typeof spyOn<typeof import("../translation-budget"), "remainingCharacters">
	>;

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
		// The default character budget is the real one, which may be backed by
		// a live Redis window shared with the rest of the suite. Pin it to a
		// full window so these cases test the loop, not ambient accounting;
		// the character-budget cases inject their own exhausted source.
		const budgetMod = await import("../translation-budget");
		budgetSpy = spyOn(budgetMod, "remainingCharacters").mockImplementation(
			async () => 100_000,
		);
		docs = new Map();
		accessible = new Set();
		events = [];
	});

	afterEach(() => {
		pipelineSpy?.mockRestore();
		lockSpy?.mockRestore();
		budgetSpy?.mockRestore();
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

	test("the wall-clock budget stops the loop and every id still reports an outcome", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		docs.set(3, makeDoc({ id: 3, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		accessible.add(3);
		const payload = makePayload();

		// The clock jumps past the budget while the first review runs.
		let current = 0;
		const clock = (): number => {
			current += 1000;
			return current;
		};
		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			const stored = docs.get(doc.id);
			if (stored) {
				docs.set(doc.id, { ...stored, translationStatus: "translated" });
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2, 3], {
			timeBudgetMs: 1500,
			now: clock,
		});

		// Every selected review has an outcome.
		expect(outcomes).toHaveLength(3);
		expect(outcomes.map((outcome) => outcome.id)).toEqual([1, 2, 3]);
		// The budget stopped the loop: only the first review was attempted.
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(outcomes[0].status).toBe("translated");
		for (const skipped of outcomes.slice(1)) {
			expect(skipped.status).toBe("skipped");
			expect(skipped.reason).toBe("not attempted — batch time budget reached");
		}
	});

	test("the in-flight review shares the batch deadline and the batch answers within the budget", async () => {
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();

		const budgetMs = 300;
		const seenDeadlines: (number | undefined)[] = [];
		pipelineSpy.mockImplementation(
			async (
				_payload: Payload,
				doc: Review,
				options?: { deadline?: number },
			) => {
				seenDeadlines.push(options?.deadline);
				// The review runs until the shared deadline, then gives up.
				const deadline = options?.deadline ?? Date.now();
				const wait = Math.max(0, deadline - Date.now()) + 5;
				await new Promise((resolve) => setTimeout(resolve, wait));
				const stored = docs.get(doc.id);
				if (stored) {
					docs.set(doc.id, {
						...stored,
						translationStatus: "failed",
						translationError: "translation time budget reached",
					});
				}
			},
		);

		const startedAt = Date.now();
		const outcomes = await retranslateReviews(payload, writer, [1, 2], {
			timeBudgetMs: budgetMs,
		});
		const elapsed = Date.now() - startedAt;

		// The in-flight review got the batch deadline.
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(seenDeadlines[0]).toBeGreaterThan(startedAt);

		// Every id still reports exactly one outcome.
		expect(outcomes.map((outcome) => outcome.id)).toEqual([1, 2]);
		expect(outcomes[0].status).toBe("failed");
		expect(outcomes[0].reason).toContain("budget");
		expect(outcomes[1].status).toBe("skipped");
		expect(outcomes[1].reason).toBe(
			"not attempted — batch time budget reached",
		);

		// The request answers within the budget, not past it.
		expect(elapsed).toBeLessThan(budgetMs * 3);
	});

	test("the character budget stops the loop and reports the remainder as skipped", async () => {
		// AC-7: a bulk run that runs out of characters reports the review that
		// hit the limit — and every review after it — as skipped, not failed.
		// The wall clock is not the limit here: the run would otherwise keep
		// attempting reviews against an exhausted 100-second window.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		docs.set(3, makeDoc({ id: 3, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		accessible.add(3);
		const payload = makePayload();

		let remaining = 5_000;
		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			// The first review spends the whole window and is stopped by the
			// pipeline's budget check, which persists `failed` with the
			// character-budget reason (the status machine is out of scope for
			// this phase).
			remaining = 0;
			const stored = docs.get(doc.id);
			if (stored) {
				docs.set(doc.id, {
					...stored,
					translationStatus: "failed",
					translationError: "translation character budget reached",
				});
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2, 3], {
			remainingCharacters: async () => remaining,
		});

		// One outcome per selected review, in input order.
		expect(outcomes).toHaveLength(3);
		expect(outcomes.map((outcome) => outcome.id)).toEqual([1, 2, 3]);
		// Only the first review was attempted; the rest never reached the
		// provider.
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		for (const outcome of outcomes) {
			expect(outcome.status).toBe("skipped");
			expect(outcome.reason).toBe(
				"not attempted — translation character budget reached",
			);
		}
	});

	test("a character stop is still reported skipped now that it persists its own reason", async () => {
		// F2: the pipeline stores the character-budget reason instead of the
		// time-budget constant. The bulk run must still recognise it as a
		// budget stop — read from the message, not inferred from the clock —
		// and report the throttled review and the rest of the batch as skipped.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();

		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			const stored = docs.get(doc.id);
			if (stored) {
				docs.set(doc.id, {
					...stored,
					translationStatus: "failed",
					translationError: "translation character budget reached",
				});
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2], {
			// A full window: the clock is not the limit here.
			remainingCharacters: async () => 100_000,
		});

		expect(pipelineSpy).toHaveBeenCalledTimes(1);
		expect(outcomes.map((outcome) => outcome.id)).toEqual([1, 2]);
		for (const outcome of outcomes) {
			expect(outcome.status).toBe("skipped");
			expect(outcome.reason).toBe(
				"not attempted — translation character budget reached",
			);
		}
	});

	test("a time-budget stop is not reclassified by the clock", async () => {
		// The clock heuristic is gone: the stored message names the limit that
		// fired, so a time stop stays a failed outcome even when the batch
		// clock still has time left. Only the character stop throttles the
		// batch.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();

		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			const stored = docs.get(doc.id);
			if (stored) {
				docs.set(doc.id, {
					...stored,
					translationStatus: "failed",
					translationError: "translation time budget reached",
				});
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2], {
			remainingCharacters: async () => 100_000,
		});

		expect(pipelineSpy).toHaveBeenCalledTimes(2);
		expect(outcomes[0].status).toBe("failed");
		expect(outcomes[0].reason).toBe("translation time budget reached");
		expect(outcomes[1].status).toBe("failed");
	});

	test("a real failure is still reported as failed when characters remain", async () => {
		// The reclassification is narrow: only a pipeline budget stop becomes
		// skipped. A provider failure keeps its own outcome and reason.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();
		pipelineSpy.mockImplementation(async (_payload: Payload, doc: Review) => {
			const stored = docs.get(doc.id);
			if (stored) {
				docs.set(doc.id, {
					...stored,
					translationStatus: "failed",
					translationError: "Quota exceeded, try again later.",
				});
			}
		});

		const outcomes = await retranslateReviews(payload, writer, [1, 2], {
			remainingCharacters: async () => 100_000,
		});

		expect(outcomes).toHaveLength(2);
		expect(outcomes[0].status).toBe("failed");
		expect(outcomes[0].reason).toContain("Quota exceeded");
		expect(outcomes[1].status).toBe("failed");
	});

	test("the wall clock wins when it expires before the character budget", async () => {
		// Whichever limit is reached first is authoritative. Here the clock
		// jumps past the budget while characters stay plentiful, so every
		// skipped review carries the unchanged time-budget reason.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		docs.set(2, makeDoc({ id: 2, translationStatus: "failed" }));
		accessible.add(1);
		accessible.add(2);
		const payload = makePayload();
		let current = 0;
		const clock = (): number => {
			current += 1000;
			return current;
		};

		const outcomes = await retranslateReviews(payload, writer, [1, 2], {
			timeBudgetMs: 1500,
			now: clock,
			remainingCharacters: async () => 100_000,
		});

		expect(outcomes).toHaveLength(2);
		expect(outcomes[1].status).toBe("skipped");
		expect(outcomes[1].reason).toBe(
			"not attempted — batch time budget reached",
		);
	});

	test("a failing character-budget read does not stop the batch", async () => {
		// NFR-3: accounting never breaks a run. The request-level reservation
		// is the real enforcement, so a budget read that throws is ignored.
		docs.set(1, makeDoc({ id: 1, translationStatus: "failed" }));
		accessible.add(1);
		const payload = makePayload();

		const outcomes = await retranslateReviews(payload, writer, [1], {
			remainingCharacters: async () => {
				throw new Error("redis unavailable");
			},
		});

		expect(outcomes).toHaveLength(1);
		expect(outcomes[0].status).toBe("translated");
		expect(pipelineSpy).toHaveBeenCalledTimes(1);
	});
});
