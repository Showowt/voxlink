// ═══════════════════════════════════════════════════════════════════════════════
// USAGE CHECK API - Check if user can use a feature
// GET /api/usage/check?feature=wingman&sessionId=xxx
// Returns: { allowed, remaining, limit, used, plan, periodEnds }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canUseFeature, type Feature } from "@/lib/usage";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Zod schema for query validation
const CheckUsageSchema = z.object({
  feature: z.enum(["wingman", "video_call", "proximity", "translate"]),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

// Rate limit: 60 checks per minute per IP
const RATE_LIMIT = 60;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  // Rate limiting
  const rateLimit = await checkRateLimit(
    `usage:check:${ip}`,
    RATE_LIMIT,
    60000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", allowed: false, remaining: 0, limit: 0 },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const params = {
      feature: searchParams.get("feature"),
      userId: searchParams.get("userId") || undefined,
      sessionId: searchParams.get("sessionId") || undefined,
    };

    // Validate input
    const parsed = CheckUsageSchema.safeParse(params);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || "Invalid request";
      return NextResponse.json(
        {
          error: errorMessage,
          allowed: false,
          remaining: 0,
          limit: 0,
        },
        { status: 400, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const { feature, userId, sessionId } = parsed.data;

    // Must have either userId or sessionId
    if (!userId && !sessionId) {
      return NextResponse.json(
        {
          error: "Either userId or sessionId is required",
          allowed: false,
          remaining: 0,
          limit: 0,
        },
        { status: 400, headers: rateLimitHeaders(rateLimit) },
      );
    }

    // Check usage
    const result = await canUseFeature(feature as Feature, userId, sessionId);

    return NextResponse.json(
      {
        allowed: result.allowed,
        remaining: result.remaining === Infinity ? -1 : result.remaining, // -1 = unlimited
        limit: result.limit === Infinity ? -1 : result.limit,
        used: result.used,
        plan: result.plan,
        periodEnds: result.periodEnds,
      },
      { status: 200, headers: rateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    console.error("[UsageCheck] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        allowed: false,
        remaining: 0,
        limit: 0,
      },
      { status: 500 },
    );
  }
}
