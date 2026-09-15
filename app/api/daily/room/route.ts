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
    const roomName = `entrevoz-${roomCode.toLowerCase()}`;
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    // Create-or-get a PRIVATE room. Private means the raw daily.co URL can't be
    // joined without a server-minted token — so possession of the 6-char code
    // alone (e.g. shoulder-surfed) no longer lets someone open the Daily client
    // directly and seize/eavesdrop the call. Joins must come through this
    // rate-limited route.
    let room: { url: string; name: string } | null = null;
    let created = false;
    const res = await fetch(`${DAILY_API_URL}/rooms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp,
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
      room = await res.json();
      created = true;
    } else if (res.status === 400) {
      // Room already exists — fetch it.
      const getRes = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
        headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
      });
      if (getRes.ok) room = await getRes.json();
    }

    if (!room) {
      const errText = await res.text();
      console.error("[Daily] Room creation failed:", res.status, errText);
      return NextResponse.json({ error: "Failed to create room" }, { status: 502 });
    }

    // Mint a short-lived meeting token for THIS room (required to join a private
    // room). max_participants:2 is still enforced server-side by Daily.
    const tokenRes = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: { room_name: roomName, exp, eject_at_token_exp: true },
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[Daily] Token mint failed:", tokenRes.status, t);
      return NextResponse.json(
        { error: "Failed to authorize room" },
        { status: 502 },
      );
    }
    const { token } = await tokenRes.json();

    return NextResponse.json({ url: room.url, name: room.name, created, token });
  } catch (err) {
    console.error("[Daily] API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
