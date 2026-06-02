import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = "https://api.daily.co/v1";

// Rate limiting
const RATE_LIMIT = 10;
const RATE_WINDOW = 60000;

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rateLimit = await checkRateLimit(`daily:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  if (!DAILY_API_KEY) {
    return NextResponse.json({ error: "Daily.co not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const roomCode = body.roomCode || "";

    // Create a temporary room that expires after 1 hour
    const res = await fetch(`${DAILY_API_URL}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: `entrevoz-${roomCode.toLowerCase()}`,
        privacy: "public", // No auth needed to join
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
          max_participants: 2,
          enable_chat: false,
          enable_screenshare: false,
          enable_recording: false,
          start_video_off: false,
          start_audio_off: false,
          lang: "en",
        },
      }),
    });

    if (res.ok) {
      const room = await res.json();
      return NextResponse.json({
        url: room.url,
        name: room.name,
        created: true,
      });
    }

    // Room might already exist — try to get it
    if (res.status === 400) {
      const getRes = await fetch(
        `${DAILY_API_URL}/rooms/entrevoz-${roomCode.toLowerCase()}`,
        {
          headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
        },
      );
      if (getRes.ok) {
        const room = await getRes.json();
        return NextResponse.json({
          url: room.url,
          name: room.name,
          created: false,
        });
      }
    }

    const errText = await res.text();
    console.error("[Daily] Room creation failed:", res.status, errText);
    return NextResponse.json({ error: "Failed to create room" }, { status: 502 });
  } catch (err) {
    console.error("[Daily] API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
