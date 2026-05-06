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

  // Step 2: ElevenLabs TTS — Multilingual v2 for quality, Flash for speed
  // Use multilingual model for non-English target languages (much better pronunciation)
  // Fall back to flash for English (speed matters more than accent matching)
  const isEnglish = targetLang.startsWith("en");
  const modelId = isEnglish ? "eleven_flash_v2_5" : "eleven_multilingual_v2";

  const ttsPayload = {
    text: translatedText,
    model_id: modelId,
    voice_settings: {
      stability: 0.5, // Higher = more consistent, less robotic
      similarity_boost: 0.95, // Max similarity to cloned voice
      style: 0.15, // Slight expressiveness
      use_speaker_boost: true,
    },
  };

  try {
    // optimize_streaming_latency: 3 = good balance of speed + quality
    // output_format: mp3_44100_64 = good quality at reasonable size
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=3&output_format=mp3_44100_64`,
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
