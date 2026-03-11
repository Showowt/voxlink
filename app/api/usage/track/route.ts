// ═══════════════════════════════════════════════════════════════════════════════
// USAGE TRACK API - Track feature usage and enforce limits
// POST /api/usage/track
// Body: { feature: string, userId?: string, sessionId?: string }
// Returns: { success, remaining, error? }
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { useFeature, type Feature } from "@/lib/usage";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Zod schema for body validation
const TrackUsageSchema = z.object({
  feature: z.enum(["wingman", "video_call", "proximity", "translate"]),
  userId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

// Rate limit: 30 tracks per minute per IP (stricter than check)
const RATE_LIMIT = 30;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  // Rate limiting
  const rateLimit = await checkRateLimit(
    `usage:track:${ip}`,
    RATE_LIMIT,
    60000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        remaining: 0,
        error: "Rate limit exceeded. Please slow down.",
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  try {
    const body = await req.json();

    // Validate input
    const parsed = TrackUsageSchema.safeParse(body);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || "Invalid request";
      return NextResponse.json(
        {
          success: false,
          remaining: 0,
          error: errorMessage,
        },
        { status: 400, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const { feature, userId, sessionId } = parsed.data;

    // Must have either userId or sessionId
    if (!userId && !sessionId) {
      return NextResponse.json(
        {
          success: false,
          remaining: 0,
          error: "Either userId or sessionId is required",
        },
        { status: 400, headers: rateLimitHeaders(rateLimit) },
      );
    }

    // Use the feature (checks limit + tracks if allowed)
    const result = await useFeature(feature as Feature, userId, sessionId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          remaining: result.remaining,
          error: result.error,
        },
        { status: 403, headers: rateLimitHeaders(rateLimit) },
      );
    }

    return NextResponse.json(
      {
        success: true,
        remaining: result.remaining === Infinity ? -1 : result.remaining,
      },
      { status: 200, headers: rateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    console.error("[UsageTrack] Error:", error);
    return NextResponse.json(
      {
        success: false,
        remaining: 0,
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
