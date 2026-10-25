/**
 * Runs the post-deploy smoke check and turns it into an exit code.
 *
 * Usage: bun run src/scripts/deploy-smoke.ts <base-url> [--max-attempts N] [--interval-ms N]
 *
 * Deliberately thin: arguments in, one report out, one status. Everything that
 * decides something - the parsing, the polling, the failure list - lives in
 * `src/lib/deploy-smoke.ts`, so it can be unit-tested without a network or a
 * process to exit (`FR-5`). Nothing here imports from `node_modules`, which is
 * what lets the deploy job run this with Bun installed and no `bun install`.
 *
 * The two flags exist because the module's default budget is too short for a
 * Coolify rollout: the webhook returns immediately while the container takes
 * minutes. A bad value fails the run instead of falling back to the default,
 * because a typo'd budget that quietly becomes thirty seconds is the failure
 * mode the option exists to remove.
 */
import {
	failedEndpoints,
	parseSmokeArguments,
	runDeploySmoke,
	type SmokeAttempt,
	type SmokeEndpointReport,
} from "../lib/deploy-smoke";

async function main(): Promise<void> {
	const parsed = parseSmokeArguments(process.argv);

	// A bad command line would probe nothing and exit 0, which reads exactly
	// like a healthy rollout. Fail loudly before any request is made.
	if (typeof parsed === "string") {
		console.error(parsed);
		process.exit(1);
	}

	const baseUrl = parsed.baseUrl;

	console.log(`Smoke check against ${baseUrl}`);

	const report = await runDeploySmoke({
		baseUrl,
		maxAttempts: parsed.maxAttempts,
		retryIntervalMs: parsed.retryIntervalMs,
	});

	for (const endpoint of report.endpoints) {
		console.log(formatEndpoint(endpoint));
	}

	console.log(`${report.requests} request(s)`);

	const failed = failedEndpoints(report);

	if (failed.length === 0) {
		console.log("Smoke check passed.");
		return;
	}

	// Name the endpoints: a reader looking at a red deploy run should not have
	// to scroll up to find out which route was broken.
	console.error(
		`Smoke check failed: ${failed.map((endpoint) => endpoint.path).join(", ")}`,
	);
	process.exit(1);
}

/** One line per endpoint, with every attempt's status on it. */
function formatEndpoint(endpoint: SmokeEndpointReport): string {
	if (endpoint.outcome === "skipped") {
		return `SKIP ${endpoint.path} (${endpoint.note})`;
	}

	const trail = endpoint.attempts.map(formatAttempt).join(" ");
	const label = endpoint.outcome === "passed" ? "PASS" : "FAIL";

	return `${label} ${endpoint.path} ${trail}`;
}

function formatAttempt(attempt: SmokeAttempt): string {
	return attempt.status === null
		? `error(${attempt.error})`
		: `${attempt.status}`;
}

// Guarded so that importing this file for its formatting helpers cannot fire a
// live probe or exit the test runner.
if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error("Smoke check crashed:", error);
		process.exit(1);
	});
}
