/**
 * Post-deploy smoke check: is the deployed site actually serving?
 *
 * On 2026-10-24 the deploy workflow went green on the Coolify webhook while
 * production answered `42703` on every query that touched taxonomy, tag, mood,
 * reading-list or review-title columns. Nothing asked the site a question, so
 * nothing noticed for ten hours. This module is the question (`FR-4`).
 *
 * Two constraints shape the design:
 *
 * - **No `node_modules` import.** The deploy job installs Bun and runs
 *   `src/scripts/deploy-smoke.ts` without `bun install`, so a single npm import
 *   would break the job. Everything here is a global: `fetch`, `setTimeout`,
 *   `URL`, `AbortSignal`.
 * - **No I/O in the decision.** `fetch` and `sleep` are options with real
 *   defaults, so the unit tests drive every path - recovery, exhaustion, no
 *   published review - in milliseconds, with no network and no real timer
 *   (`FR-5`).
 *
 * Every probe is a `GET` to a fixed path, with no credentials and no writes
 * (`NFR-3`).
 */

/**
 * A response, as far as this module cares about it.
 *
 * Narrower than `Response` so the test seam stays trivial: a fake site has to
 * produce a status and, for the discovery call only, a body.
 */
export interface SmokeResponse {
	/** The HTTP status. */
	readonly status: number;
	/** Reads the body. Only discovery reads one. */
	text(): Promise<string>;
}

/** The `fetch` seam. Compatible with `globalThis.fetch` for what is used here. */
export type SmokeFetch = (
	url: string,
	init?: RequestInit,
) => Promise<SmokeResponse>;

/** The `sleep` seam, so no test ever waits on a real timer. */
export type SmokeSleep = (milliseconds: number) => Promise<void>;

/** How one endpoint's probe ended. */
export type SmokeOutcome = "passed" | "failed" | "skipped";

/** One request to one endpoint. */
export interface SmokeAttempt {
	/** 1-based position in the retry sequence. */
	readonly attempt: number;
	/** The status, or `null` when the request never produced a response. */
	readonly status: number | null;
	/** The transport error, or `null` when a response arrived. */
	readonly error: string | null;
}

/** The verdict for one endpoint, with the trail that produced it. */
export interface SmokeEndpointReport {
	/** The path that was probed, relative to the base URL. */
	readonly path: string;
	/** `skipped` never fails a run; only `failed` does. */
	readonly outcome: SmokeOutcome;
	/** Every request made, in order. Empty when skipped. */
	readonly attempts: readonly SmokeAttempt[];
	/** The status of the last attempt, or `null` if it never answered. */
	readonly finalStatus: number | null;
	/** Why an endpoint failed or was skipped. `null` on success. */
	readonly note: string | null;
}

/** The whole run: what the script prints and what decides the exit code. */
export interface SmokeReport {
	/** Whether every probed endpoint passed. */
	readonly ok: boolean;
	/** Per endpoint, in probe order. The detail route, if any, comes last. */
	readonly endpoints: readonly SmokeEndpointReport[];
	/** Requests made, retries and discovery included - the `NFR-3` budget. */
	readonly requests: number;
}

/** The seams and the budget. Everything else is fixed by the requirement. */
export interface DeploySmokeOptions {
	/** Origin to probe, e.g. `https://chasing-chapters.com`. */
	readonly baseUrl: string;
	/** Defaults to the global `fetch`. */
	readonly fetch?: SmokeFetch;
	/** Defaults to a real `setTimeout` wait. */
	readonly sleep?: SmokeSleep;
	/** Attempts per endpoint. Defaults to `DEFAULT_MAX_ATTEMPTS`. */
	readonly maxAttempts?: number;
	/** Wait between attempts, in ms. Defaults to `DEFAULT_RETRY_INTERVAL_MS`. */
	readonly retryIntervalMs?: number;
}

/**
 * The endpoints every run probes, at their final destination.
 *
 * `/` and `/reviews` answer with a 307 into `/en/...` and `/feed.xml` with a
 * 308, so probing those would measure the redirect layer rather than the app.
 *
 * `/api/genres?limit=1` leads because it is the endpoint that returned HTTP 500
 * during the outage: it reads `genres.name`, one of the dropped columns. `/id`
 * earns its place by proving the locale routing and the translation columns
 * survived, which no English route can show.
 */
export const SMOKE_ENDPOINTS = [
	"/api/genres?limit=1",
	"/en",
	"/id",
	"/en/reviews",
	"/sitemap.xml",
] as const;

/** The discovery query: one published review, at depth 0, for its slug. */
const PUBLISHED_REVIEWS_PATH =
	"/api/reviews?limit=1&depth=0&where[_status][equals]=published";

/** The path reported when the detail route could not be probed. */
const DETAIL_PATH_TEMPLATE = "/en/reviews/<slug>";

/**
 * Attempts per endpoint, when the caller does not say otherwise.
 *
 * Six endpoints times six attempts is 36 requests, plus one for discovery, so a
 * worst-case run stays under the "about forty" of `NFR-3`. It also bounds a
 * dead rollout at roughly two and a half minutes, which is inside the deploy
 * job's patience and short enough to fail a run while someone is still
 * watching. `maxAttempts` exists because a Coolify rollout can outlast that:
 * raising it buys a longer window and spends the request budget, so the
 * arithmetic above is the ceiling to reason against.
 */
export const DEFAULT_MAX_ATTEMPTS = 6;

/** Wait between attempts. Long enough for a container to finish booting. */
export const DEFAULT_RETRY_INTERVAL_MS = 5_000;

/** Per-request ceiling, so one hung socket cannot hold the whole run. */
const REQUEST_TIMEOUT_MS = 5_000;

/** The only status that counts as serving. */
const PASSING_STATUS = 200;

/** Everything the probe loop needs, built once per run. */
interface ProbeContext {
	readonly fetch: SmokeFetch;
	readonly sleep: SmokeSleep;
	readonly baseUrl: string;
	readonly maxAttempts: number;
	readonly retryIntervalMs: number;
}

/** A request that either produced a response or a message explaining itself. */
type RequestResult =
	| { readonly response: SmokeResponse; readonly error: null }
	| { readonly response: null; readonly error: string };

/** The published review the detail probe should use, if there is one. */
interface Discovery {
	/** The slug to probe, or `null` when nothing usable came back. */
	readonly slug: string | null;
	/** Why the detail probe is skipped. Empty when a slug was found. */
	readonly reason: string;
}

const globalFetch: SmokeFetch = async (url, init) => {
	const response = await fetch(url, init);

	return { status: response.status, text: () => response.text() };
};

const defaultSleep: SmokeSleep = (milliseconds) =>
	new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});

/**
 * Probes the deployed site and reports, per endpoint, whether it is serving.
 *
 * Sequential on purpose: endpoints are tried in a fixed order so a failed run
 * reads like a checklist, and the request budget stays arithmetic rather than
 * depending on how many endpoints happen to be slow at once. A run that fails
 * the endpoint set is still a complete report - nothing throws.
 */
export async function runDeploySmoke(
	options: DeploySmokeOptions,
): Promise<SmokeReport> {
	const context: ProbeContext = {
		fetch: options.fetch ?? globalFetch,
		sleep: options.sleep ?? defaultSleep,
		baseUrl: options.baseUrl,
		maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
		retryIntervalMs: options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS,
	};

	const endpoints: SmokeEndpointReport[] = [];

	const discovery = await discoverPublishedSlug(context);
	let requests = 1;

	for (const path of SMOKE_ENDPOINTS) {
		const endpoint = await pollEndpoint(context, path);
		requests += endpoint.attempts.length;
		endpoints.push(endpoint);
	}

	if (discovery.slug === null) {
		endpoints.push({
			path: DETAIL_PATH_TEMPLATE,
			outcome: "skipped",
			attempts: [],
			finalStatus: null,
			note: discovery.reason,
		});
	} else {
		const detailPath = `/en/reviews/${encodeURIComponent(discovery.slug)}`;
		const endpoint = await pollEndpoint(context, detailPath);
		requests += endpoint.attempts.length;
		endpoints.push(endpoint);
	}

	return {
		ok: endpoints.every((endpoint) => endpoint.outcome !== "failed"),
		endpoints,
		requests,
	};
}

/**
 * Polls one path until it answers 200 or the attempt budget is spent.
 *
 * A 500 and a refused connection are the same verdict here, only with a
 * different trail: both mean "not serving yet, try again". That is deliberate -
 * a rollout has both shapes, and the deploy only cares whether it settled.
 */
async function pollEndpoint(
	context: ProbeContext,
	path: string,
): Promise<SmokeEndpointReport> {
	const url = toUrl(context.baseUrl, path);
	const attempts: SmokeAttempt[] = [];

	for (let attempt = 1; attempt <= context.maxAttempts; attempt += 1) {
		const result = await requestOnce(context, url);
		attempts.push({
			attempt,
			status: result.response === null ? null : result.response.status,
			error: result.error,
		});

		if (result.response !== null && result.response.status === PASSING_STATUS) {
			return {
				path,
				outcome: "passed",
				attempts,
				finalStatus: PASSING_STATUS,
				note: null,
			};
		}

		if (attempt < context.maxAttempts) {
			await context.sleep(context.retryIntervalMs);
		}
	}

	const last = attempts[attempts.length - 1];

	return {
		path,
		outcome: "failed",
		attempts,
		finalStatus: last.status,
		note: last.error,
	};
}

/**
 * Finds one published review so the detail route can be probed.
 *
 * This call is outside the required endpoint set: it exists to make the detail
 * probe possible, so a failure here skips that probe instead of failing the
 * run. `/api/genres` is the canary for the database layer; spending six more
 * requests on a discovery miss would only push the run closer to the `NFR-3`
 * budget without telling the deploy anything new.
 */
async function discoverPublishedSlug(
	context: ProbeContext,
): Promise<Discovery> {
	const result = await requestOnce(
		context,
		toUrl(context.baseUrl, PUBLISHED_REVIEWS_PATH),
	);

	if (result.response === null) {
		return {
			slug: null,
			reason: `reviews API unreachable: ${result.error}`,
		};
	}

	if (result.response.status !== PASSING_STATUS) {
		return {
			slug: null,
			reason: `reviews API returned ${result.response.status}`,
		};
	}

	const raw = await readText(result.response);

	if (raw === null) {
		return { slug: null, reason: "reviews API body could not be read" };
	}

	const slug = publishedSlugFrom(raw);

	return slug === null
		? { slug: null, reason: "no published review" }
		: { slug, reason: "" };
}

/** One `GET`, with the timeout applied and any throw turned into a message. */
async function requestOnce(
	context: ProbeContext,
	url: string,
): Promise<RequestResult> {
	try {
		const response = await context.fetch(url, {
			method: "GET",
			redirect: "follow",
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		return { response, error: null };
	} catch (error) {
		return { response: null, error: errorMessage(error) };
	}
}

/**
 * The slug of the first document in a Payload list response, or `null`.
 *
 * The body is untrusted input in the ordinary sense - it comes from the site
 * under test - so nothing is asserted about its shape beyond the two fields
 * this needs.
 */
function publishedSlugFrom(raw: string): string | null {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (typeof parsed !== "object" || parsed === null || !("docs" in parsed)) {
		return null;
	}

	const docs = parsed.docs;

	if (!Array.isArray(docs) || docs.length === 0) {
		return null;
	}

	const first: unknown = docs[0];

	if (typeof first !== "object" || first === null || !("slug" in first)) {
		return null;
	}

	return typeof first.slug === "string" && first.slug.length > 0
		? first.slug
		: null;
}

async function readText(response: SmokeResponse): Promise<string | null> {
	try {
		return await response.text();
	} catch {
		return null;
	}
}

/** Joins a path onto the base URL, so a base with or without a slash works. */
function toUrl(baseUrl: string, path: string): string {
	return new URL(path, baseUrl).toString();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
