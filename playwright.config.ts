import { defineConfig, devices } from "@playwright/test";
import {
	resolveE2EBaseURL,
	resolveE2EPort,
	resolveWorkerCount,
} from "./src/lib/e2e-harness";

/**
 * Playwright E2E test configuration.
 * @see https://playwright.dev/docs/test-configuration
 */
const e2ePort = resolveE2EPort(process.env);
const baseURL = resolveE2EBaseURL(process.env);

export default defineConfig({
	// Test directory
	testDir: "./e2e",

	// Seed the deterministic fixture before the suite runs. The seeding is an
	// upsert, so this is safe to run against a populated database.
	globalSetup: "./e2e/global-setup.ts",

	// Run tests in parallel
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 2 : 0,

	// Bounded worker count: 3 on a developer machine, 1 in CI. Playwright's
	// default (half the logical CPUs) starves the app server and times out
	// every page load.
	workers: resolveWorkerCount(process.env),

	// Reporter configuration
	reporter: [["html", { open: "never" }], ["list"]],

	// Shared settings for all the projects below
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		baseURL,

		// Collect trace when retrying the failed test
		trace: "on-first-retry",

		// Capture screenshot on failure
		screenshot: "only-on-failure",
	},

	// Configure projects for major browsers
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	// Serve the production build. `bun run test:e2e` builds before the suite
	// starts, so a missing or failed build fails the run loudly instead of
	// serving stale code.
	webServer: {
		command: `bun --bun next start --port ${e2ePort}`,
		url: baseURL,
		// A foreign server on this port must never be reused silently
		reuseExistingServer: false,
		// A cold production start plus the app warm-up can take a while
		timeout: 300 * 1000,
	},
});
