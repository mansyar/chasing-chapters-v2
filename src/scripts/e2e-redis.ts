/**
 * The Redis readiness probe.
 *
 * Redis is a prerequisite of the e2e run: the app uses it for the translation
 * cache, and the README lists it as a prerequisite. Without Redis the app does
 * not fail - it degrades to no cache - so a run started against a Redis that is
 * not up would carry on in a silently degraded state instead of stopping with
 * a clear message.
 *
 * The probe therefore connects once, pings the server and reports what it
 * found. The decision itself lives in `src/lib/e2e-harness.ts` so it can be
 * unit tested without a live Redis; this module owns the connection.
 */
import Redis from "ioredis";
import {
	checkRedisReadiness,
	type E2EEnv,
	type RedisReadiness,
} from "../lib/e2e-harness";

/**
 * How long the probe waits for the connection before it gives up.
 *
 * The probe is a precondition check, not a wait-and-retry loop: a Redis that
 * is not up yet is a run that has to stop.
 */
const CONNECT_TIMEOUT_MS = 2_000;

/**
 * Pings a Redis server once.
 *
 * The client never reconnects on its own: a probe that keeps retrying would
 * turn a Redis that is down into a timeout cascade instead of a clear failure.
 */
export async function pingRedis(url: string): Promise<void> {
	const client = new Redis(url, {
		lazyConnect: true,
		connectTimeout: CONNECT_TIMEOUT_MS,
		maxRetriesPerRequest: 0,
		retryStrategy: () => null,
	});

	// The connection error is carried by the promise below; the listener only
	// keeps ioredis from emitting an error nobody handles.
	client.on("error", () => {});

	try {
		await client.connect();
		await client.ping();
	} finally {
		client.disconnect();
	}
}

/**
 * Checks that the Redis server the app would use is reachable.
 */
export async function probeRedis(
	env: E2EEnv = process.env,
): Promise<RedisReadiness> {
	return checkRedisReadiness(env, pingRedis);
}
