import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ElevenLabs bills per character — cap what one request can burn.
const MAX_TEXT_LENGTH = 500;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  // Redis-backed (shared across serverless instances) — the old per-instance
  // Map reset on every cold start, making it trivially bypassable.
  const rl = await checkRateLimit(`voice-dub:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { text, voiceId, targetLang = "en", skipTranslation = false } = body as {
    text?: string;
    voiceId?: string;
    targetLang?: string;
    skipTranslation?: boolean;
  };

  if (!text?.trim() || !voiceId) {
    return NextResponse.json(
      { error: "Missing text or voiceId" },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Text too long (max ${MAX_TEXT_LENGTH} chars)`, fallback: true },
      { status: 413 },
    );
  }
  if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) {
    return NextResponse.json({ error: "Invalid voiceId" }, { status: 400 });
  }

  // Step 1: Translate text (skip if caller already translated)
  let translatedText = text;
  if (!skipTranslation) {
    try {
      const translateRes = await fetch(`${req.nextUrl.origin}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceLang: "auto",
          targetLang,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (translateRes.ok) {
        const td = await translateRes.json();
        translatedText = td.translation ?? td.translated ?? text;
      }
    } catch {
      /* use original text as fallback */
    }
  }

  if (!translatedText.trim()) {
    return NextResponse.json({ error: "Empty translation" }, { status: 400 });
  }

  // eleven_flash_v2_5 does NOT support these languages — it produces garbled
  // audio, not an error. Hand them to the client's browser-TTS fallback.
  const FLASH_UNSUPPORTED = new Set(["th", "he", "lt"]);
  if (FLASH_UNSUPPORTED.has((targetLang || "en").split("-")[0])) {
    return NextResponse.json(
      { error: "unsupported_language", translatedText, fallback: true },
      { status: 422 },
    );
  }

  // Step 2: ElevenLabs TTS — Flash v2.5 for ALL languages (fastest multilingual model)
  const ttsPayload = {
    text: translatedText,
    model_id: "eleven_flash_v2_5",
    voice_settings: {
      stability: 0.7,
      similarity_boost: 0.95,
      style: 0.1,
      use_speaker_boost: true,
    },
  };

  try {
    // optimize_streaming_latency: 4 = maximum speed
    // output_format: mp3_44100_128 = high quality audio
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=4&output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(ttsPayload),
        signal: AbortSignal.timeout(8000),
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
