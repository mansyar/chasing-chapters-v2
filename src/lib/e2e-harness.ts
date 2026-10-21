/**
 * Shared, pure helpers for the Playwright e2e harness.
 *
 * The Playwright configuration and the bun unit tests need the same two
 * answers - how many workers the suite may use, and which port the
 * production server listens on - so both are resolved here, once, from the
 * environment. Keeping the logic out of `playwright.config.ts` is what makes
 * it testable: `bun test` only collects files under `src/`, so the helper and
 * its test live beside the other `src/lib` modules.
 *
 * The module must stay free of runtime imports (no database, no filesystem,
 * no server-only code): it is loaded by the Playwright config as well as by
 * the unit tests.
 */

/** Worker cap on a developer machine, chosen to leave headroom for the app, Postgres and Redis. */
export const DEFAULT_WORKER_COUNT = 3;

/** Worker count in CI, where the run has to be serial and deterministic. */
export const CI_WORKER_COUNT = 1;

/**
 * Port the e2e production server listens on. It is deliberately not 3000 so a
 * developer's running dev server cannot collide with the suite.
 */
export const DEFAULT_E2E_PORT = 3100;

/** The environment slice the harness reads. */
export type E2EEnv = Record<string, string | undefined>;

/**
 * CI is active for any non-empty value other than an explicit "false"/"0".
 */
function isCiActive(env: E2EEnv): boolean {
	const value = env.CI?.trim();
	if (value === undefined || value === "") {
		return false;
	}
	return value !== "false" && value !== "0";
}

/**
 * Parses a positive integer, ignoring anything that is not one.
 */
function parsePositiveInteger(raw: string | undefined): number | undefined {
	if (raw === undefined) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (trimmed === "") {
		return undefined;
	}
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return undefined;
	}
	return parsed;
}

/**
 * Resolves the worker count the e2e suite runs with.
 *
 * The rules, in order:
 * - `CI` pins the run to a single worker, because CI runs on a shared
 *   runner and must stay deterministic. It wins over the override.
 * - `PLAYWRIGHT_WORKERS` overrides the cap when it is a positive integer;
 *   a malformed value is ignored so a typo cannot crash the config.
 * - Otherwise the cap is {@link DEFAULT_WORKER_COUNT}, so the suite never
 *   occupies the machine's full logical CPU count.
 */
export function resolveWorkerCount(env: E2EEnv): number {
	if (isCiActive(env)) {
		return CI_WORKER_COUNT;
	}
	return parsePositiveInteger(env.PLAYWRIGHT_WORKERS) ?? DEFAULT_WORKER_COUNT;
}

/**
 * Resolves the port the e2e production server listens on.
 *
 * `E2E_PORT` overrides the default; a malformed or out-of-range value falls
 * back to {@link DEFAULT_E2E_PORT}.
 */
export function resolveE2EPort(env: E2EEnv): number {
	const override = parsePositiveInteger(env.E2E_PORT);
	if (override === undefined || override > 65535) {
		return DEFAULT_E2E_PORT;
	}
	return override;
}

/**
 * Resolves the base URL the suite navigates against. It always matches the
 * port the production server was started on.
 */
export function resolveE2EBaseURL(env: E2EEnv): string {
	return `http://localhost:${resolveE2EPort(env)}`;
}
