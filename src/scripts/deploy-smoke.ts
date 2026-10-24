/**
 * Runs the post-deploy smoke check and turns it into an exit code.
 *
 * Usage: bun run src/scripts/deploy-smoke.ts <base-url>
 *
 * Deliberately thin: one argument, one report, one status. The decision lives
 * in `src/lib/deploy-smoke.ts` so it can be unit-tested without a network
 * (`FR-5`). Nothing here imports from `node_modules`, which is what lets the
 * deploy job run this with Bun installed and no `bun install`.
 */
import {
	runDeploySmoke,
	type SmokeAttempt,
	type SmokeEndpointReport,
} from "../lib/deploy-smoke";

/** `process.argv[0]` is the runtime and `[1]` the script, so the base is third. */
const BASE_URL_ARGUMENT = 2;

async function main(): Promise<void> {
	const baseUrl = process.argv[BASE_URL_ARGUMENT]?.trim();

	// An empty base would probe nothing and exit 0, which reads exactly like a
	// healthy rollout. Fail loudly before any request is made.
	if (!baseUrl) {
		console.error("usage: bun run src/scripts/deploy-smoke.ts <base-url>");
		process.exit(1);
	}

	console.log(`Smoke check against ${baseUrl}`);

	const report = await runDeploySmoke({ baseUrl });

	for (const endpoint of report.endpoints) {
		console.log(formatEndpoint(endpoint));
	}

	console.log(`${report.requests} request(s)`);

	const failed = report.endpoints.filter(
		(endpoint) => endpoint.outcome === "failed",
	);

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

main().catch((error: unknown) => {
	console.error("Smoke check crashed:", error);
	process.exit(1);
});
