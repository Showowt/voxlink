import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEntitlement } from "@/lib/entitlement";
import { deviceBudget, serviceBudgetOk, DAILY_ALLOWANCES } from "@/lib/budget";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const rl = await checkRateLimit(`los-tts:${ip}`, 120, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const { text, voiceId, lang, deviceId } = body as {
    text?: string;
    voiceId?: string;
    lang?: string;
    deviceId?: string;
  };

  if (!text?.trim() || !voiceId) {
    return NextResponse.json({ error: "Missing text or voiceId" }, { status: 400 });
  }

  // ── Spend gates (MONETIZATION_PLAN Phase 0) — shares the voice-dub TTS
  // allowance; over budget → client's device-voice fallback.
  if (!(await serviceBudgetOk("elevenlabs"))) {
    return NextResponse.json(
      { error: "Natural voice temporarily unavailable", fallback: true },
      { status: 503 },
    );
  }
  const ent = await getEntitlement({ deviceId });
  const identity = typeof deviceId === "string" && deviceId.length >= 8 ? deviceId : ip;
  const allowance = DAILY_ALLOWANCES.tts();
  const budget = await deviceBudget("tts", identity, ent.entitled, allowance.free, allowance.premium);
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "Daily natural-voice allowance used", fallback: true, upgrade: !ent.entitled },
      { status: 402 },
    );
  }

  // eleven_flash_v2_5 garbles these languages (no support) — tell the client
  // to use the device voice instead of returning broken audio.
  const FLASH_UNSUPPORTED = new Set(["lt", "th", "he"]);
  if (lang && FLASH_UNSUPPORTED.has(lang.split("-")[0].toLowerCase())) {
    return NextResponse.json(
      { error: "unsupported_language", fallback: true },
      { status: 422 },
    );
  }

  // Cap text length
  const trimmed = text.trim().slice(0, 500);

  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?optimize_streaming_latency=4&output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: "eleven_flash_v2_5",
          voice_settings: {
            stability: 0.65,
            similarity_boost: 0.9,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error("[LangOS TTS] ElevenLabs error:", ttsRes.status, errText);
      return NextResponse.json({ error: "TTS failed", fallback: true }, { status: 422 });
    }

    const audioArrayBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioArrayBuffer).toString("base64");

    return NextResponse.json({ audioBase64, mimeType: "audio/mpeg" });
  } catch (e) {
    console.error("[LangOS TTS] Unexpected error:", e);
    return NextResponse.json({ error: "TTS failed", fallback: true }, { status: 500 });
  }
}
