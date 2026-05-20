/**
 * /api/transcribe/route.ts
 *
 * Whisper API endpoint for Safari/Firefox STT fallback.
 * Receives audio blob, sends to OpenAI Whisper, returns transcript.
 *
 * POST FormData: { audio: Blob, language?: string }
 * → { text: string, language: string }
 *
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Rate limiter (30 req/min per IP - transcription is expensive) ────────────
const rl = new Map<string, { n: number; resetAt: number }>();
function rateLimit(ip: string, max = 30): boolean {
  const now = Date.now();
  const r = rl.get(ip);
  if (!r || now > r.resetAt) {
    rl.set(ip, { n: 1, resetAt: now + 60_000 });
    return true;
  }
  if (r.n >= max) return false;
  r.n++;
  return true;
}

// ─── Language code to Whisper language ────────────────────────────────────────
const WHISPER_LANG_MAP: Record<string, string> = {
  en: "en", es: "es", fr: "fr", de: "de", it: "it", pt: "pt",
  zh: "zh", ja: "ja", ko: "ko", ar: "ar", ru: "ru", hi: "hi",
  nl: "nl", pl: "pl", tr: "tr", vi: "vi", th: "th", id: "id",
  uk: "uk", el: "el", he: "he", sv: "sv", cs: "cs", ro: "ro",
  hu: "hu", fi: "fi", lt: "lt", da: "da", no: "no", ms: "ms",
  tl: "tl",
};

export async function POST(req: NextRequest) {
  // Check for OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Whisper not configured. OPENAI_API_KEY required." },
      { status: 501 },
    );
  }

  // Rate limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob | null;
    const language = (formData.get("language") as string) ?? "en";

    if (!audioFile) {
      return NextResponse.json(
        { error: "audio file required" },
        { status: 400 },
      );
    }

    // Validate file size (max 25MB for Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file too large (max 25MB)" },
        { status: 400 },
      );
    }

    // Prepare form data for OpenAI — use correct extension for the mime type
    // iOS Safari records audio/mp4, others record audio/webm
    const mimeType = audioFile.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, `audio.${ext}`);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "json");

    // Set language if supported
    const normalizedLang = language.toLowerCase().split("-")[0].split("_")[0];
    const whisperLang = WHISPER_LANG_MAP[normalizedLang];
    if (whisperLang) {
      whisperForm.append("language", whisperLang);
    }

    // Call OpenAI Whisper API
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: whisperForm,
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Whisper] API error:", response.status, errorText);
      return NextResponse.json(
        { error: "Transcription failed" },
        { status: 502 },
      );
    }

    const data = await response.json();

    return NextResponse.json({
      text: data.text ?? "",
      language: language,
    });
  } catch (error) {
    console.error("[Whisper] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
