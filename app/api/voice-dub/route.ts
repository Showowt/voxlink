import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Rate limit: 60 dubs per minute per IP
const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= 60) return false;
  e.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { text, voiceId, targetLang = "en" } = body as {
    text?: string;
    voiceId?: string;
    targetLang?: string;
  };

  if (!text?.trim() || !voiceId) {
    return NextResponse.json(
      { error: "Missing text or voiceId" },
      { status: 400 },
    );
  }

  // Step 1: Translate text (use existing translate API internally)
  let translatedText = text;
  try {
    const translateRes = await fetch(`${req.nextUrl.origin}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLang: "auto",
        targetLang,
      }),
    });
    if (translateRes.ok) {
      const td = await translateRes.json();
      translatedText = td.translation ?? td.translated ?? text;
    }
  } catch {
    /* use original text as fallback */
  }

  // Skip TTS if text is empty after translation
  if (!translatedText.trim()) {
    return NextResponse.json({ error: "Empty translation" }, { status: 400 });
  }

  // Step 2: ElevenLabs TTS with Flash model (fastest, lowest latency)
  const ttsPayload = {
    text: translatedText,
    model_id: "eleven_flash_v2_5",
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.9,
      style: 0.0,
      use_speaker_boost: true,
    },
    output_format: "mp3_44100_128",
  };

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(ttsPayload),
      },
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("[VoiceDub] TTS error:", ttsRes.status, errText);
      return NextResponse.json(
        {
          error: "TTS failed",
          translatedText,
          fallback: true,
        },
        { status: 422 },
      );
    }

    // Stream the audio back
    const audioArrayBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioArrayBuffer).toString("base64");

    return NextResponse.json({
      audioBase64,
      translatedText,
      mimeType: "audio/mpeg",
      voiceId,
    });
  } catch (e) {
    console.error("[VoiceDub] Unexpected error:", e);
    return NextResponse.json(
      {
        error: "TTS failed",
        translatedText,
        fallback: true,
      },
      { status: 500 },
    );
  }
}
