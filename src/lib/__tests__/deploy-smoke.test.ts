import { describe, expect, it } from "bun:test";
import {
	DEFAULT_MAX_ATTEMPTS,
	runDeploySmoke,
	SMOKE_ENDPOINTS,
	type SmokeFetch,
	type SmokeResponse,
} from "../deploy-smoke";

const BASE_URL = "https://chasing-chapters.example";

const NO_REVIEWS = JSON.stringify({ docs: [] });

/** The path of a probed URL, as the fake site keys its plan. */
function pathOf(url: string): string {
	return new URL(url).pathname;
}

/**
 * A fake site.
 *
 * Each path answers with the statuses it was given, in order, and repeats the
 * last one once the list runs out: `[500, 500, 200]` is "two failures then
 * recovery", `[500]` is "never recovers", `["error"]` is "the connection
 * cannot be made". A path with no entry answers 200, so a test only has to
 * describe the endpoint it is about.
 */
function fakeSite(
	plan: Record<string, Array<number | "error">> = {},
	bodies: Record<string, string> = {},
): SmokeFetch & { calls: string[]; inits: Array<RequestInit | undefined> } {
	const calls: string[] = [];
	const inits: Array<RequestInit | undefined> = [];
	const served = new Map<string, number>();

	const fetchImpl = async (
		url: string,
		init?: RequestInit,
	): Promise<SmokeResponse> => {
		const path = pathOf(url);
		calls.push(path);
		inits.push(init);

		const sequence = plan[path] ?? [200];
		const index = served.get(path) ?? 0;
		served.set(path, index + 1);

		const next = sequence[Math.min(index, sequence.length - 1)];
		if (next === "error") {
			throw new Error(`connect ECONNREFUSED ${path}`);
		}

		return { status: next, text: async () => bodies[path] ?? "" };
	};

	return Object.assign(fetchImpl, { calls, inits });
}

describe("deploy-smoke", () => {
	it("passes an endpoint that recovers inside the retry budget", async () => {
		// This is the outage's shape from the outside: /api/genres answered 500
		// while the rest of the site was fine. The check has to wait it out
		// rather than fail the deploy on a cold first response.
		const site = fakeSite(
			{ "/api/genres": [500, 500, 200] },
			{ "/api/reviews": NO_REVIEWS },
		);
		let sleeps = 0;

		const report = await runDeploySmoke({
			baseUrl: BASE_URL,
			fetch: site,
			sleep: async () => {
				sleeps += 1;
			},
		});

		expect(report.ok).toBe(true);
		const genres = report.endpoints.find(
			(endpoint) => endpoint.path === "/api/genres?limit=1",
		);
		expect(genres?.outcome).toBe("passed");
		expect(genres?.attempts.map((attempt) => attempt.status)).toEqual([
			500, 500, 200,
		]);
		// Two failed attempts, so two waits — and never a real one.
		expect(sleeps).toBe(2);
		// NFR-3: the check is read-only.
		expect(site.inits.every((init) => init?.method === "GET")).toBe(true);
	});

	it("fails and names the endpoint that never recovered", async () => {
		// A deploy that leaves /api/genres returning 500 *is* the 2026-10-24
		// outage. The report has to point at that path and status, otherwise
		// the workflow log says "smoke failed" and the reader learns nothing.
		const site = fakeSite(
			{ "/api/genres": [500] },
			{ "/api/reviews": NO_REVIEWS },
		);

		const report = await runDeploySmoke({
			baseUrl: BASE_URL,
			fetch: site,
			sleep: async () => {},
		});

		expect(report.ok).toBe(false);
		const failed = report.endpoints.filter(
			(endpoint) => endpoint.outcome === "failed",
		);
		expect(failed.map((endpoint) => endpoint.path)).toEqual([
			"/api/genres?limit=1",
		]);
		expect(failed[0]?.finalStatus).toBe(500);
		expect(failed[0]?.attempts).toHaveLength(DEFAULT_MAX_ATTEMPTS);
		// NFR-3: at most about forty requests, retries included.
		expect(report.requests).toBeLessThanOrEqual(40);
	});

	it("passes and skips the detail probe when no review is published", async () => {
		// A site with nothing published yet is healthy, not broken (AC-6). The
		// detail route is the one probe that needs data, so it reports skipped
		// and the rest of the run still decides the exit code.
		const site = fakeSite({}, { "/api/reviews": JSON.stringify({ docs: [] }) });

		const report = await runDeploySmoke({
			baseUrl: BASE_URL,
			fetch: site,
			sleep: async () => {},
		});

		expect(report.ok).toBe(true);
		expect(report.endpoints.map((endpoint) => endpoint.path)).toEqual([
			...SMOKE_ENDPOINTS,
			"/en/reviews/<slug>",
		]);
		const detail = report.endpoints.at(-1);
		expect(detail?.outcome).toBe("skipped");
		expect(detail?.attempts).toEqual([]);
		expect(site.calls).not.toContain("/en/reviews/<slug>");
	});

	it("probes the detail route of the published slug", async () => {
		// The list route only proves the query ran. A detail route proves the
		// review's own columns still line up with the schema, which is the part
		// a taxonomy migration is most likely to break.
		const site = fakeSite(
			{},
			{ "/api/reviews": JSON.stringify({ docs: [{ slug: "the-lantern" }] }) },
		);

		const report = await runDeploySmoke({
			baseUrl: BASE_URL,
			fetch: site,
			sleep: async () => {},
		});

		expect(report.ok).toBe(true);
		const detail = report.endpoints.at(-1);
		expect(detail?.path).toBe("/en/reviews/the-lantern");
		expect(detail?.outcome).toBe("passed");
		expect(site.calls).toContain("/en/reviews/the-lantern");
	});

	it("records a transport error instead of throwing", async () => {
		// A refused connection is what a rollout that has not bound its port
		// looks like. It has to become a failed endpoint in the report, because
		// a thrown error would lose every other endpoint's result.
		const site = fakeSite({ "/id": ["error"] }, { "/api/reviews": NO_REVIEWS });

		const report = await runDeploySmoke({
			baseUrl: BASE_URL,
			fetch: site,
			sleep: async () => {},
		});

		expect(report.ok).toBe(false);
		const indonesian = report.endpoints.find(
			(endpoint) => endpoint.path === "/id",
		);
		expect(indonesian?.outcome).toBe("failed");
		expect(indonesian?.finalStatus).toBeNull();
		expect(indonesian?.note).toContain("ECONNREFUSED");
		expect(indonesian?.attempts).toHaveLength(DEFAULT_MAX_ATTEMPTS);
	});
});
