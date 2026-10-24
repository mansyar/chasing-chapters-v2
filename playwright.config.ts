import { defineConfig, devices } from "@playwright/test";
import {
	E2E_STORAGE_ADAPTER,
	resolveE2EBaseURL,
	resolveE2EDatabaseUri,
	resolveE2EPort,
	resolveWorkerCount,
} from "./src/lib/e2e-harness";

/**
 * Playwright E2E test configuration.
 * @see https://playwright.dev/docs/test-configuration
 */
const e2ePort = resolveE2EPort(process.env);
const baseURL = resolveE2EBaseURL(process.env);

/**
 * The suite runs against its own database, never against the database the
 * developer works in. The connection string is derived from the ambient one
 * here as well, so a bare `playwright test` targets the e2e database too.
 * Without a usable connection string there is no e2e database to talk to, and
 * falling back to the ambient one would put the fixture back into the
 * developer's rows.
 */
const e2eDatabaseUri = resolveE2EDatabaseUri(process.env);
if (!e2eDatabaseUri) {
	throw new Error(
		"DATABASE_URI is missing or unusable, so the e2e database cannot be resolved.",
	);
}

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
			testIgnore: "**/admin/**",
			use: { ...devices["Desktop Chrome"] },
		},
		// The three admin surfaces share the fixture's translation states:
		// the bell counts the reviews that need attention, the bulk action
		// re-translates exactly those reviews, and the edit-view poller
		// watches one of them finish. Run in one project they would race
		// over the same documents, so they are chained as dependent
		// projects and run one after the other. The locale preference spec
		// logs in and reads the admin's stored preference, and it is chained
		// before the draft-preview spec so the admin flow stays sequential.
		{
			name: "admin-attention-bell",
			testMatch: "**/admin/attention-bell.spec.ts",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "admin-bulk-retranslate",
			testMatch: "**/admin/bulk-retranslate.spec.ts",
			dependencies: ["admin-attention-bell"],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "admin-translation-poller",
			testMatch: "**/admin/translation-poller.spec.ts",
			dependencies: ["admin-bulk-retranslate"],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "admin-locale-preference",
			testMatch: "**/admin/locale-preference.spec.ts",
			dependencies: ["admin-translation-poller"],
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "admin-draft-preview",
			testMatch: "**/admin/draft-preview.spec.ts",
			dependencies: ["admin-locale-preference"],
			use: { ...devices["Desktop Chrome"] },
		},
	],

	// Serve the production build. `bun run test:e2e` builds before the suite
	// starts, so a missing or failed build fails the run loudly instead of
	// serving stale code.
	//
	// The suite serves the standalone artifact - the same server the
	// production deployment runs (`bun run start`), not `next start`, which
	// Next.js refuses to run with `output: "standalone"`. The static assets
	// and the media directory are copied into the standalone output first,
	// exactly like the production start script does.
	webServer: {
		command:
			"bun run scripts/copy-standalone-assets.ts && bun --bun .next/standalone/server.js",
		url: baseURL,
		// A foreign server on this port must never be reused silently
		reuseExistingServer: false,
		// A cold production start plus the app warm-up can take a while
		timeout: 300 * 1000,
		// The offline translation stub replaces the provider for the e2e
		// run: no credentials, no quota, no network. The rest of the
		// environment is inherited - the app needs its database and cache
		// variables to boot.
		env: {
			...process.env,
			// The app server talks to the e2e database, so the suite never
			// sees the developer's rows.
			DATABASE_URI: e2eDatabaseUri,
			// The e2e run stores its media on the local disk instead of in
			// object storage.
			STORAGE_ADAPTER: E2E_STORAGE_ADAPTER,
			// The cover images keep pointing at the app's own media proxy
			// instead of the public object storage domain.
			NEXT_PUBLIC_R2_PUBLIC_URL: "",
			// The standalone server takes the port and the host from the
			// environment.
			PORT: String(e2ePort),
			HOSTNAME: "localhost",
			// The offline translation stub replaces the provider for the e2e
			// run: no credentials, no quota, no network. The rest of the
			// environment is inherited - the app needs its database and cache
			// variables to boot.
			TRANSLATION_TEST_MODE: "1",
		},
	},
});
