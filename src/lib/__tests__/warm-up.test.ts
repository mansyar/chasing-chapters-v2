import { afterEach, describe, expect, it, vi } from "bun:test";
import { shouldWarmUp, waitForServer, warmRoutes } from "../warm-up";

type FetchLike = (
	url: string,
	init?: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

describe("shouldWarmUp", () => {
	it("returns true only for production nodejs runtime", () => {
		expect(
			shouldWarmUp({ NODE_ENV: "production", NEXT_RUNTIME: "nodejs" }),
		).toBe(true);
	});

	it("returns false in development", () => {
		expect(
			shouldWarmUp({ NODE_ENV: "development", NEXT_RUNTIME: "nodejs" }),
		).toBe(false);
	});

	it("returns false for the edge runtime", () => {
		expect(shouldWarmUp({ NODE_ENV: "production", NEXT_RUNTIME: "edge" })).toBe(
			false,
		);
	});

	it("returns false when the env keys are absent (build-inlined values)", () => {
		expect(shouldWarmUp({})).toBe(false);
	});
});

describe("waitForServer", () => {
	it("resolves true as soon as the server responds ok", async () => {
		let calls = 0;
		const fetchImpl: FetchLike = () => {
			calls++;
			return Promise.resolve({
				ok: calls >= 2,
				status: calls >= 2 ? 200 : 503,
			});
		};
		const ready = await waitForServer(fetchImpl, "http://x/", {
			timeoutMs: 1000,
			intervalMs: 1,
		});
		expect(ready).toBe(true);
		expect(calls).toBe(2);
	});

	it("gives up after the timeout and resolves false", async () => {
		const fetchImpl: FetchLike = () =>
			Promise.resolve({ ok: false, status: 503 });
		const ready = await waitForServer(fetchImpl, "http://x/", {
			timeoutMs: 30,
			intervalMs: 5,
		});
		expect(ready).toBe(false);
	});

	it("treats fetch rejections as not-ready and keeps retrying", async () => {
		let calls = 0;
		const fetchImpl: FetchLike = () => {
			calls++;
			if (calls < 3) return Promise.reject(new Error("ECONNREFUSED"));
			return Promise.resolve({ ok: true, status: 200 });
		};
		const ready = await waitForServer(fetchImpl, "http://x/", {
			timeoutMs: 1000,
			intervalMs: 1,
		});
		expect(ready).toBe(true);
		expect(calls).toBe(3);
	});

	it("aborts each poll with a signal so a stalled response cannot outlive the deadline", async () => {
		const signals: Array<AbortSignal | undefined> = [];
		const fetchImpl: FetchLike = (_url, init) => {
			signals.push(init?.signal ?? undefined);
			return Promise.resolve({ ok: false, status: 503 });
		};
		await waitForServer(fetchImpl, "http://x/", {
			timeoutMs: 30,
			intervalMs: 5,
		});
		expect(signals.length).toBeGreaterThan(0);
		for (const signal of signals) {
			expect(signal).toBeDefined();
		}
	});
});

describe("warmRoutes", () => {
	it("requests each route once, in order, with per-route timing", async () => {
		const urls: string[] = [];
		const fetchImpl: FetchLike = (url) => {
			urls.push(url);
			return Promise.resolve({ ok: true, status: 200 });
		};
		const results = await warmRoutes(
			fetchImpl,
			"http://x:3000",
			["/", "/reviews", "/about"],
			5,
		);
		expect(urls).toEqual([
			"http://x:3000/",
			"http://x:3000/reviews",
			"http://x:3000/about",
		]);
		expect(results.map((r) => r.route)).toEqual(["/", "/reviews", "/about"]);
		expect(results.every((r) => r.ok && r.status === 200)).toBe(true);
		expect(results.every((r) => r.durationMs >= 0)).toBe(true);
	});

	it("continues warming later routes when one route fails", async () => {
		const urls: string[] = [];
		const fetchImpl: FetchLike = (url) => {
			urls.push(url);
			if (url.endsWith("/reviews")) {
				return Promise.resolve({ ok: false, status: 500 });
			}
			return Promise.resolve({ ok: true, status: 200 });
		};
		const results = await warmRoutes(
			fetchImpl,
			"http://x:3000",
			["/", "/reviews", "/about"],
			5,
		);
		expect(urls).toHaveLength(3);
		const reviews = results.find((r) => r.route === "/reviews");
		expect(reviews?.ok).toBe(false);
		expect(reviews?.status).toBe(500);
		expect(results.find((r) => r.route === "/about")?.ok).toBe(true);
	});

	it("records a failed result when fetch rejects", async () => {
		const fetchImpl: FetchLike = () => Promise.reject(new Error("boom"));
		const results = await warmRoutes(fetchImpl, "http://x:3000", ["/"], 5);
		expect(results).toHaveLength(1);
		expect(results[0].ok).toBe(false);
		expect(results[0].status).toBeNull();
	});
});
