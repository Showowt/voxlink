// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER - Serverless-compatible rate limiting using Upstash Redis
// Falls back to in-memory for local development
// ═══════════════════════════════════════════════════════════════════════════════

// Initialize Upstash Redis client (lazy, with error handling)
let redis: unknown = null;
let redisInitAttempted = false;

function getRedis(): {
  incr: Function;
  pttl: Function;
  expire: Function;
  lpush: Function;
  ltrim: Function;
  pipeline: Function;
} | null {
  if (redisInitAttempted) return redis as ReturnType<typeof getRedis>;
  redisInitAttempted = true;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // Validate env vars exist and are not empty/whitespace
  if (!url || !token || url.length < 10 || token.length < 10) {
    console.warn("[RateLimit] Redis not configured or invalid credentials");
    return null;
  }

  try {
    // Dynamic import to prevent build-time crashes
    const { Redis } = require("@upstash/redis");
    redis = new Redis({ url, token });
    return redis as ReturnType<typeof getRedis>;
  } catch (error) {
    console.error("[RateLimit] Failed to initialize Redis:", error);
    return null;
  }
}

// In-memory fallback for development (NOT production-safe)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Check rate limit for an identifier (typically IP address)
 * Uses Upstash Redis in production, falls back to memory in dev
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 60,
  windowMs: number = 60000,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowSeconds = Math.ceil(windowMs / 1000);
  const key = `ratelimit:${identifier}`;

  // Use Redis if available (production)
  if (redis) {
    try {
      // Use sliding window with Redis
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.pttl(key);

      const results = await pipeline.exec();
      const count = results[0] as number;
      const ttl = results[1] as number;

      // Set expiry on first request
      if (ttl === -1) {
        await redis.expire(key, windowSeconds);
      }

      const resetAt = now + (ttl > 0 ? ttl : windowMs);
      const remaining = Math.max(0, limit - count);
      const allowed = count <= limit;

      return { allowed, remaining, resetAt, limit };
    } catch (error) {
      console.error("[RateLimit] Redis error, falling back to memory:", error);
      // Fall through to memory-based rate limiting
    }
  }

  // In production, require Redis for proper rate limiting
  // In-memory is trivially bypassed (just reconnect)
  if (process.env.NODE_ENV === "production" && !redis) {
    console.error(
      "[RateLimit] CRITICAL: Redis not configured in production. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
    // Still allow requests but log for monitoring
    // Remove this line to block requests entirely: throw new Error("Rate limiting unavailable");
  }

  const record = memoryStore.get(identifier);

  if (!record || now > record.resetAt) {
    memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
      limit,
    };
  }

  record.count++;
  const remaining = Math.max(0, limit - record.count);
  const allowed = record.count <= limit;

  // Cleanup old entries periodically
  if (memoryStore.size > 1000) {
    const cutoff = now;
    Array.from(memoryStore.entries()).forEach(([k, v]) => {
      if (v.resetAt < cutoff) {
        memoryStore.delete(k);
      }
    });
  }

  return { allowed, remaining, resetAt: record.resetAt, limit };
}

/**
 * Create rate limit headers for HTTP response
 */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": Math.ceil(
            (result.resetAt - Date.now()) / 1000,
          ).toString(),
        }),
  };
}

/**
 * Track analytics event (translation quality, usage, etc.)
 * Uses Redis for fast writes, can be processed into Supabase later
 */
export async function trackEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      const event = {
        type: eventType,
        timestamp: Date.now(),
        ...data,
      };

      // Push to Redis list for batch processing
      await redis.lpush("analytics:events", JSON.stringify(event));

      // Trim to last 10000 events to prevent unbounded growth
      await redis.ltrim("analytics:events", 0, 9999);
    } catch (error) {
      console.error("[Analytics] Failed to track event:", error);
    }
  }
}
