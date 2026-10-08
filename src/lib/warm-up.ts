// Post-deploy warm-up for the standalone production server.
//
// Why: the first request a container serves after a (re)start absorbs the
// Next.js + Payload boot cost (measured locally: first 200 at ~26s after
// process start, second request still ~7s TTFB). A Lighthouse run or real
// visitor landing in that window sees multi-second TTFB on the root document,
// which is what the 3.5s cold TTFB in the 2026-10-08 production run was.
// Warm-up fires from src/instrumentation.ts once per server boot: it waits
// until the HTTP listener answers, then requests the key ISR pages so the
// first real traffic hits warm caches.

export type WarmupResult = {
	route: string;
	status: number | null;
	durationMs: number;
	ok: boolean;
};

export type FetchLike = (
	url: string,
	init?: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

export function shouldWarmUp(env: {
	NODE_ENV?: string;
	NEXT_RUNTIME?: string;
}): boolean {
	return env.NODE_ENV === "production" && env.NEXT_RUNTIME === "nodejs";
}

export async function waitForServer(
	fetchImpl: FetchLike,
	url: string,
	opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<boolean> {
	const timeoutMs = opts?.timeoutMs ?? 120_000;
	const intervalMs = opts?.intervalMs ?? 500;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const res = await fetchImpl(url);
			if (res.ok) return true;
		} catch {
			// server not listening yet — retry
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return false;
}

export async function warmRoutes(
	fetchImpl: FetchLike,
	baseUrl: string,
	routes: string[],
	timeoutMs = 30_000,
): Promise<WarmupResult[]> {
	const results: WarmupResult[] = [];
	for (const route of routes) {
		const startedAt = Date.now();
		let status: number | null = null;
		let ok = false;
		try {
			const res = await fetchImpl(`${baseUrl}${route}`, {
				signal: AbortSignal.timeout(timeoutMs),
			});
			status = res.status;
			ok = res.ok;
		} catch {
			ok = false;
		}
		results.push({ route, status, durationMs: Date.now() - startedAt, ok });
	}
	return results;
}
