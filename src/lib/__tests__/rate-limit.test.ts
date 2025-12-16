import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, getClientIP } from "../rate-limit";
import * as redisModule from "../redis";

// Mock the redis module
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
}));

describe("rateLimit", () => {
  let mockRedisClient: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedisClient = {
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should allow request when under limit", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(
      mockRedisClient as unknown as ReturnType<
        typeof redisModule.getRedisClient
      >
    );
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.ttl.mockResolvedValue(60);

    const result = await rateLimit("test:key", 5, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetInSeconds).toBe(60);
    expect(mockRedisClient.incr).toHaveBeenCalledWith("ratelimit:test:key");
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      "ratelimit:test:key",
      60
    );
  });

  it("should set expire only on first request", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(
      mockRedisClient as unknown as ReturnType<
        typeof redisModule.getRedisClient
      >
    );
    mockRedisClient.incr.mockResolvedValue(3); // Not first request
    mockRedisClient.ttl.mockResolvedValue(45);

    await rateLimit("test:key", 5, 60);

    expect(mockRedisClient.expire).not.toHaveBeenCalled();
  });

  it("should block request when limit exceeded", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(
      mockRedisClient as unknown as ReturnType<
        typeof redisModule.getRedisClient
      >
    );
    mockRedisClient.incr.mockResolvedValue(6); // Over limit of 5
    mockRedisClient.ttl.mockResolvedValue(30);

    const result = await rateLimit("test:key", 5, 60);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetInSeconds).toBe(30);
  });

  it("should allow request at exact limit", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(
      mockRedisClient as unknown as ReturnType<
        typeof redisModule.getRedisClient
      >
    );
    mockRedisClient.incr.mockResolvedValue(5); // Exactly at limit
    mockRedisClient.ttl.mockResolvedValue(10);

    const result = await rateLimit("test:key", 5, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("should allow request when Redis is unavailable (graceful degradation)", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(null);

    const result = await rateLimit("test:key", 5, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.resetInSeconds).toBe(0);
  });

  it("should allow request on Redis error (fail open)", async () => {
    vi.mocked(redisModule.getRedisClient).mockReturnValue(
      mockRedisClient as unknown as ReturnType<
        typeof redisModule.getRedisClient
      >
    );
    mockRedisClient.incr.mockRejectedValue(
      new Error("Redis connection failed")
    );

    const result = await rateLimit("test:key", 5, 60);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
  });
});

describe("getClientIP", () => {
  it("should extract IP from x-forwarded-for header", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "192.168.1.1, 10.0.0.1");

    const ip = getClientIP(headers);

    expect(ip).toBe("192.168.1.1");
  });

  it("should extract IP from x-real-ip header as fallback", () => {
    const headers = new Headers();
    headers.set("x-real-ip", "10.0.0.5");

    const ip = getClientIP(headers);

    expect(ip).toBe("10.0.0.5");
  });

  it("should return 'unknown' when no IP headers present", () => {
    const headers = new Headers();

    const ip = getClientIP(headers);

    expect(ip).toBe("unknown");
  });

  it("should prefer x-forwarded-for over x-real-ip", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "192.168.1.1");
    headers.set("x-real-ip", "10.0.0.5");

    const ip = getClientIP(headers);

    expect(ip).toBe("192.168.1.1");
  });
});
