import * as Sentry from "@sentry/nextjs";
import { shouldWarmUp, waitForServer, warmRoutes } from "./lib/warm-up";

export async function register() {
	// NOTE: read these via direct member expressions — Next's build inlines
	// `process.env.NEXT_RUNTIME` / `process.env.NODE_ENV` as build-time
	// constants, but the runtime `process.env` object may not contain them
	// (passing `process.env` wholesale read undefined at runtime).
	const env = {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_RUNTIME: process.env.NEXT_RUNTIME,
	};

	// Post-deploy warm-up: the first request after a container (re)start
	// absorbs the Next.js + Payload boot cost (multi-second TTFB — see
	// docs/pagespeed-optimization.md). Wait for the HTTP listener, then
	// request the key ISR pages so the first real traffic hits warm caches.
	if (shouldWarmUp(env)) {
		void (async () => {
			const baseUrl = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
			const ready = await waitForServer(fetch, `${baseUrl}/`);
			if (!ready) {
				console.warn("[Warmup] Server did not become ready; skipping warm-up");
				return;
			}
			const results = await warmRoutes(fetch, baseUrl, [
				"/",
				"/reviews",
				"/reading-lists",
				"/about",
			]);
			for (const r of results) {
				console.log(
					`[Warmup] ${r.route} -> ${r.ok ? "ok" : "FAILED"} status=${r.status} ${r.durationMs}ms`,
				);
			}
		})().catch((err) => console.warn("[Warmup] failed:", err));
	}

	if (process.env.NEXT_RUNTIME === "nodejs") {
		await import("../sentry.server.config");
	}

	if (process.env.NEXT_RUNTIME === "edge") {
		await import("../sentry.edge.config");
	}
}

export const onRequestError = Sentry.captureRequestError;
