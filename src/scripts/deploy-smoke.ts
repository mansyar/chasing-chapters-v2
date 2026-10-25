/**
 * Runs the post-deploy smoke check and turns it into an exit code.
 *
 * Usage: bun run src/scripts/deploy-smoke.ts <base-url> [--max-attempts N] [--interval-ms N]
 *
 * Deliberately thin: arguments in, one report out, one status. The decision
 * lives in `src/lib/deploy-smoke.ts` so it can be unit-tested without a network
 * (`FR-5`). Nothing here imports from `node_modules`, which is what lets the
 * deploy job run this with Bun installed and no `bun install`.
 *
 * The two flags exist because the module's default budget is too short for a
 * Coolify rollout: the webhook returns immediately while the container takes
 * minutes. A bad value fails the run instead of falling back to the default,
 * because a typo'd budget that quietly becomes thirty seconds is the failure
 * mode the option exists to remove.
 */
import {
	runDeploySmoke,
	type SmokeAttempt,
	type SmokeEndpointReport,
} from "../lib/deploy-smoke";

/** `process.argv[0]` is the runtime and `[1]` the script, so arguments start at 2. */
const FIRST_ARGUMENT = 2;

const USAGE =
	"usage: bun run src/scripts/deploy-smoke.ts <base-url> [--max-attempts N] [--interval-ms N]";

/** What the command line asked for. */
interface ParsedArguments {
	readonly baseUrl: string;
	readonly maxAttempts?: number;
	readonly retryIntervalMs?: number;
}

async function main(): Promise<void> {
	const parsed = parseArguments(process.argv);

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

/**
 * Reads the base URL and the two budget flags, or returns the message to print.
 *
 * Hand-rolled rather than a parser dependency: two flags do not justify one,
 * and this file must stay import-free so the deploy job can run it without
 * `bun install`. A flag with a missing or unusable value is an error rather
 * than a silent fall back to the default, so a typo cannot shrink the budget
 * without saying so.
 */
function parseArguments(argv: readonly string[]): ParsedArguments | string {
	const positional: string[] = [];
	let maxAttempts: number | undefined;
	let retryIntervalMs: number | undefined;

	for (let index = FIRST_ARGUMENT; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument !== "--max-attempts" && argument !== "--interval-ms") {
			positional.push(argument.trim());
			continue;
		}

		const value = positiveInteger(argv[index + 1]);
		if (value === null) {
			return `${USAGE}\n${argument} needs a positive whole number`;
		}

		if (argument === "--max-attempts") {
			maxAttempts = value;
		} else {
			retryIntervalMs = value;
		}

		index += 1;
	}

	const baseUrl = positional[0];

	if (positional.length !== 1 || baseUrl === "") {
		return USAGE;
	}

	return { baseUrl, maxAttempts, retryIntervalMs };
}

/** A positive whole number, or `null` when the text is anything else. */
function positiveInteger(raw: string | undefined): number | null {
	if (raw === undefined) {
		return null;
	}

	const value = Number(raw.trim());

	return Number.isInteger(value) && value > 0 ? value : null;
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
