import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoomButton } from "./boom-button";

/**
 * The forced-error trigger is test-only: keep it out of the sitemap (which is
 * content-driven and never lists it) and out of search indexes. No production
 * UI links here, so readers can only arrive by typing the URL.
 */
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

/**
 * Test-only page that hosts the error-boundary trigger.
 *
 * Plain server component: the throw happens client-side in `BoomButton` after
 * a click, so prerendering stays clean and the `[locale]` segment boundary
 * catches the failure in both locales.
 */
export default function BoomPage() {
	// Test-only route: 404 everywhere except the e2e run, which sets
	// `E2E_TEST_ROUTES=1` in the child environment (`src/scripts/e2e-run.ts`).
	// The production build evaluates this at request time, so the same
	// artifact the e2e suite exercises 404s in every other deployment.
	if (process.env.E2E_TEST_ROUTES !== "1") {
		notFound();
	}

	return (
		<main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
			<BoomButton />
		</main>
	);
}
