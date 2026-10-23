/**
 * Runs the end-to-end suite from a clean, isolated state.
 *
 * The suite gets its own database, its own storage and its own build:
 *
 * 1. the e2e database is created (it never existed before, or it is reused),
 * 2. the schema is applied to it,
 * 3. the fixture is seeded into it,
 * 4. the production app is built against it - the homepage and the reading
 *    list pages are prerendered, so the build has to see the fixture,
 * 5. Playwright runs against the build.
 *
 * Every step runs in its own child process with the resolved environment, so
 * a step that fails stops the run with the child's own output on screen.
 *
 * Before the first step, the run checks that Redis is reachable. Redis is a
 * prerequisite of the suite, and the app would otherwise degrade to no cache
 * and carry on - the run stops with a message that says what to start.
 */
import { spawn } from "node:child_process";
import { E2E_STORAGE_ADAPTER, resolveE2EDatabaseUri } from "../lib/e2e-harness";
import { probeRedis } from "./e2e-redis";

type Step = {
	/** What the step does - printed before it starts. */
	name: string;
	command: string;
	args: string[];
	/**
	 * Text written to the child's standard input. `payload migrate` asks for
	 * a confirmation on its first run, and the answer is written here
	 * instead of piped through a shell.
	 */
	stdin?: string;
};

/**
 * The environment every step runs with.
 *
 * `DATABASE_URI` points at the e2e database, `STORAGE_ADAPTER` selects
 * Payload's own disk storage instead of object storage, and the public media
 * URL is emptied so the cover images keep pointing at the app's own media
 * proxy - the proxy serves the file from the disk the fixture wrote it to.
 */
function resolveChildEnv(): NodeJS.ProcessEnv {
	const e2eUri = resolveE2EDatabaseUri(process.env);
	if (!e2eUri) {
		console.error(
			"[e2e] DATABASE_URI is missing or unusable, so the e2e database cannot be resolved.",
		);
		process.exit(1);
	}

	return {
		...process.env,
		DATABASE_URI: e2eUri,
		// The child compares the ambient connection string with this one, so
		// a `.env` file that overrode the variable stops the run instead of
		// pointing the run at the wrong database.
		E2E_EXPECTED_DATABASE_URI: e2eUri,
		STORAGE_ADAPTER: E2E_STORAGE_ADAPTER,
		NEXT_PUBLIC_R2_PUBLIC_URL: "",
	};
}

/**
 * Runs one step and resolves when it succeeded.
 */
function runStep(step: Step, env: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(step.command, step.args, {
			cwd: process.cwd(),
			env,
			stdio: ["pipe", "inherit", "inherit"],
			shell: false,
		});

		child.stdin?.end(step.stdin ?? "");

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(`The e2e step "${step.name}" failed with exit code ${code}.`),
			);
		});
	});
}

const playwrightArgs = process.argv.slice(2);

const steps: Step[] = [
	{
		name: "create the e2e database",
		command: "bun",
		args: ["run", "src/scripts/e2e-database.ts"],
	},
	{
		name: "apply the schema to the e2e database",
		command: "bun",
		args: ["run", "payload", "migrate"],
		// `payload migrate` asks for a confirmation when the schema and the
		// migrations disagree. The answer is written to its standard input.
		stdin: "y\n",
	},
	{
		name: "seed the fixture",
		command: "bun",
		args: ["run", "seed:e2e"],
	},
	{
		name: "build the production app",
		command: "bun",
		args: ["run", "build"],
	},
	{
		name: "run the suite",
		command: "bun",
		args: ["x", "playwright", "test", ...playwrightArgs],
	},
];

const env = resolveChildEnv();

// Redis is a prerequisite: without it the app degrades to no cache and the
// suite would run on in a silently degraded state. The run stops here, before
// anything is written, with a message that names the variable and says how to
// start Redis.
console.log("[e2e] check that Redis is reachable...");
const redis = await probeRedis(env);
if (!redis.ok) {
	console.error(`[e2e] ${redis.message}`);
	process.exit(1);
}

for (const step of steps) {
	console.log(`[e2e] ${step.name}...`);
	try {
		await runStep(step, env);
	} catch (error) {
		console.error(
			`[e2e] ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

console.log("[e2e] The suite finished.");
