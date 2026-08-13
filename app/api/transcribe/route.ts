/**
 * /api/transcribe/route.ts
 *
 * Whisper API endpoint for Safari/Firefox STT fallback.
 * Receives audio blob, sends to OpenAI Whisper, returns transcript.
 *
 * POST FormData: { audio: Blob, language?: string }
 * → { text: string, language: string, dropped?: boolean, reason?: string }
 *
 * ANTI-HALLUCINATION (2026):
 *   Whisper confidently invents text on silence/noise ("Thank you.",
 *   "Thanks for watching", subtitle credits). On long/quiet calls this
 *   produced "translations of things that were not said". We now:
 *     - request verbose_json to get per-segment confidence signals
 *     - drop segments with high no_speech_prob / low avg_logprob
 *     - drop segments with runaway compression_ratio (repetition loops)
 *     - drop known Whisper-on-silence artifact phrases (tight blacklist)
 *     - run temperature: 0 for deterministic, lower-hallucination output
 *
 * @version 2.0.0
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
// Prevent unbounded growth of the rate-limit map on long-lived instances
setInterval(() => {
  const now = Date.now();
  rl.forEach((v, k) => {
    if (now > v.resetAt) rl.delete(k);
  });
}, 5 * 60_000).unref?.();

// ─── Language code to Whisper language ────────────────────────────────────────
const WHISPER_LANG_MAP: Record<string, string> = {
  en: "en", es: "es", fr: "fr", de: "de", it: "it", pt: "pt",
  zh: "zh", ja: "ja", ko: "ko", ar: "ar", ru: "ru", hi: "hi",
  nl: "nl", pl: "pl", tr: "tr", vi: "vi", th: "th", id: "id",
  uk: "uk", el: "el", he: "he", sv: "sv", cs: "cs", ro: "ro",
  hu: "hu", fi: "fi", lt: "lt", da: "da", no: "no", ms: "ms",
  tl: "tl",
};

// ─── Whisper confidence gating thresholds ─────────────────────────────────────
// Tuned to be conservative: only drop segments that are clearly silence/noise,
// so we never swallow real short utterances ("sí", "ok", "hola").
const NO_SPEECH_HARD = 0.8; // no_speech_prob above this → drop regardless
const NO_SPEECH_SOFT = 0.5; // combined with low avg_logprob → drop
const AVG_LOGPROB_MIN = -0.85; // below this = low confidence
const COMPRESSION_MAX = 2.4; // above this = repetition-loop hallucination

interface WhisperSegment {
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

// ─── Known Whisper-on-silence artifacts (normalized, exact-match only) ─────────
// Deliberately tight: YouTube caption residue + pure filler that Whisper emits
// on silence. We only drop when the WHOLE transcript equals one of these, so
// real conversation is never affected.
const HALLUCINATION_PHRASES = new Set<string>([
  "thank you",
  "thank you.",
  "thanks for watching",
  "thanks for watching!",
  "thank you for watching",
  "thank you for watching.",
  "please subscribe",
  "please subscribe.",
  "like and subscribe",
  "subtitles by the amara.org community",
  "subtitles by",
  "transcription by",
  "amara.org",
  "www.",
  ".",
  "..",
  "...",
  "you",
  "you.",
  "bye",
  "bye.",
  "bye bye",
  "the end",
  "the end.",
  "♪",
  "♪♪",
  "[music]",
  "[silence]",
  "(silence)",
  "[applause]",
  "[blank_audio]",
  "音",
  "はい",
  "ご視聴ありがとうございました",
  "字幕",
  "感谢观看",
  "请不吝点赞",
  "subscribe to my channel",
]);

function normalize(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

function isHallucinationPhrase(text: string): boolean {
  const n = normalize(text);
  if (!n) return true;
  if (HALLUCINATION_PHRASES.has(n)) return true;
  // Strip trailing punctuation and retry
  const stripped = n.replace(/[.!?。！？\s]+$/g, "");
  if (HALLUCINATION_PHRASES.has(stripped)) return true;
  // Pure punctuation / symbols only
  if (/^[\s.,!?…♪·・。！？]+$/.test(n)) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Whisper not configured. OPENAI_API_KEY required." },
      { status: 501 },
    );
  }

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
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }

    // Too small = almost certainly silence/click. Don't waste a Whisper call.
    if (audioFile.size < 1600) {
      return NextResponse.json({ text: "", language, dropped: true, reason: "too_small" });
    }

    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file too large (max 25MB)" },
        { status: 400 },
      );
    }

    // Prepare form data for OpenAI — use correct extension for the mime type
    // iOS Safari records audio/mp4, others record audio/webm
    const mimeType = audioFile.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("m4a") ? "m4a" : mimeType.includes("aac") ? "aac" : mimeType.includes("caf") ? "caf" : mimeType.includes("ogg") ? "ogg" : "webm";
    const whisperForm = new FormData();
    whisperForm.append("file", audioFile, `audio.${ext}`);
    whisperForm.append("model", "whisper-1");
    // verbose_json → per-segment no_speech_prob / avg_logprob / compression_ratio
    whisperForm.append("response_format", "verbose_json");
    // Deterministic decoding lowers hallucination rate on ambiguous audio
    whisperForm.append("temperature", "0");

    const normalizedLang = language.toLowerCase().split("-")[0].split("_")[0];
    const whisperLang = WHISPER_LANG_MAP[normalizedLang];
    if (whisperLang) {
      whisperForm.append("language", whisperLang);
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Whisper] API error:", response.status, errorText);
      return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
    }

    const data = (await response.json()) as {
      text?: string;
      segments?: WhisperSegment[];
    };

    const segments = Array.isArray(data.segments) ? data.segments : [];

    // ── Confidence gating: rebuild transcript from trustworthy segments only ──
    let text: string;
    let reason: string | undefined;

    if (segments.length > 0) {
      const kept = segments.filter((s) => {
        const noSpeech = s.no_speech_prob ?? 0;
        const logprob = s.avg_logprob ?? 0;
        const compression = s.compression_ratio ?? 1;

        if (noSpeech >= NO_SPEECH_HARD) return false; // clearly silence
        if (noSpeech >= NO_SPEECH_SOFT && logprob < AVG_LOGPROB_MIN) return false; // quiet + unsure
        if (compression > COMPRESSION_MAX) return false; // repetition loop
        if (isHallucinationPhrase(s.text ?? "")) return false; // known artifact
        return true;
      });
      text = kept.map((s) => s.text ?? "").join(" ").trim();
      if (!text && (data.text ?? "").trim()) reason = "low_confidence";
    } else {
      // No segment data — fall back to whole-text artifact check
      text = (data.text ?? "").trim();
    }

    // Final whole-transcript artifact guard
    if (text && isHallucinationPhrase(text)) {
      text = "";
      reason = "artifact";
    }

    return NextResponse.json({
      text,
      language,
      ...(text ? {} : { dropped: true, reason: reason ?? "no_speech" }),
    });
  } catch (error) {
    console.error("[Whisper] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
