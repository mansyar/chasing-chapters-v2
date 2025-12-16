import { getRedisClient } from "./redis";

const RATE_LIMIT_PREFIX = "ratelimit:";

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Remaining requests in current window */
  remaining: number;
  /** Seconds until the rate limit resets */
  resetInSeconds: number;
}

/**
 * Rate limit a request using Redis INCR + EXPIRE pattern.
 *
 * @param key - Unique identifier for the rate limit (e.g., "like:{ip}:{reviewId}")
 * @param limit - Maximum number of requests allowed in the window
 * @param windowSeconds - Time window in seconds
 * @returns RateLimitResult indicating if request is allowed
 *
 * @example
 * const result = await rateLimit(`like:${ip}:${reviewId}`, 5, 60);
 * if (!result.success) {
 *   return { error: "Too many requests", retryAfter: result.resetInSeconds };
 * }
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = getRedisClient();

  // Graceful degradation: if Redis is unavailable, allow the request
  if (!client) {
    return { success: true, remaining: limit, resetInSeconds: 0 };
  }

  const fullKey = `${RATE_LIMIT_PREFIX}${key}`;

  try {
    // Atomic increment
    const current = await client.incr(fullKey);

    // Set expiry only on first request in window
    if (current === 1) {
      await client.expire(fullKey, windowSeconds);
    }

    // Get TTL for reset time
    const ttl = await client.ttl(fullKey);
    const resetInSeconds = ttl > 0 ? ttl : windowSeconds;

    const remaining = Math.max(0, limit - current);
    const success = current <= limit;

    if (!success) {
      console.log(
        `[RateLimit] Blocked: key=${key}, current=${current}, limit=${limit}`
      );
    }

    return { success, remaining, resetInSeconds };
  } catch (error) {
    console.error("[RateLimit] Redis error, allowing request:", error);
    // Fail open: allow request if Redis errors
    return { success: true, remaining: limit, resetInSeconds: 0 };
  }
}

/**
 * Get client IP from Next.js headers.
 * Falls back to "unknown" if IP cannot be determined.
 */
export function getClientIP(headersList: Headers): string {
  // x-forwarded-for can contain multiple IPs, take the first one
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  // Fallback headers
  const realIP = headersList.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  return "unknown";
}
