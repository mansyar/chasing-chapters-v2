import Redis from "ioredis";

// Redis client singleton
let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    console.log("[Redis] REDIS_URL not configured, caching disabled");
    return null;
  }

  if (!redis) {
    console.log("[Redis] Connecting to Redis...");
    redis = new Redis(process.env.REDIS_URL);

    redis.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err);
    });
  }

  return redis;
}

// Translation cache helpers
const TRANSLATION_PREFIX = "translate:";
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

export async function getCachedTranslation(
  text: string,
  targetLang: string
): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const key = `${TRANSLATION_PREFIX}${targetLang}:${text}`;
    const cached = await client.get(key);
    if (cached) {
      console.log(`[Redis] Cache hit for translation`);
    }
    return cached;
  } catch (error) {
    console.error("[Redis] Cache get error:", error);
    return null;
  }
}

export async function setCachedTranslation(
  text: string,
  targetLang: string,
  translation: string
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const key = `${TRANSLATION_PREFIX}${targetLang}:${text}`;
    await client.setex(key, CACHE_TTL, translation);
  } catch (error) {
    console.error("[Redis] Cache set error:", error);
  }
}
