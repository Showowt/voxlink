/**
 * useTranscription.ts
 *
 * Complete speech-to-text → translation → WebRTC broadcast pipeline.
 *
 * MODE SELECTION (automatic):
 *   Chrome / Edge  → Web Speech API (real-time, zero latency, free)
 *   Safari / Firefox → MediaRecorder + Whisper API (4s chunks, needs OPENAI_API_KEY)
 *   No mic / error  → silent fallback, sets error state
 *
 * DATA FLOW:
 *   Your mic → [STT] → raw transcript
 *                    → /api/translate → translated text
 *                    → sendMessage({ type:'transcription', text: raw })
 *                    → sendMessage({ type:'translation',   text: translated, original: raw })
 *
 * Remote peer:
 *   Receives type:'translation'   → displayed as subtitle
 *   Receives type:'transcription' → fed to Cyrano Mode
 *
 * @version 1.0.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  SpeechRecognitionInstance,
  SpeechRecognitionConstructor,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "@/app/lib/speech-types";

// ─── BCP-47 language tags for Web Speech API ──────────────────────────────────
const SPEECH_LANG_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-CO", // Colombian Spanish for target market (vs es-ES)
  "es-CO": "es-CO",
  "es-MX": "es-MX",
  "es-ES": "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-BR",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  ar: "ar-SA",
  ru: "ru-RU",
  hi: "hi-IN",
};

// Whisper chunk duration in ms - lower = faster transcription, higher = more accurate
const WHISPER_CHUNK_MS = 1500;

// ─── Types ────────────────────────────────────────────────────────────────────
export type TranscriptionMode = "webspeech" | "whisper" | "unavailable";

export interface UseTranscriptionOptions {
  /** ISO 639-1 code for the language YOU speak */
  myLanguage: string;
  /** ISO 639-1 code for the language THEY speak */
  theirLanguage: string;
  /** localStream from useWebRTC — used for Whisper MediaRecorder mode */
  localStream: MediaStream | null;
  /** sendMessage from useWebRTC — broadcasts to remote peer */
  sendMessage: (message: string) => boolean;
  /** Only run when an active call is in progress */
  isActive: boolean;
}

export interface UseTranscriptionReturn {
  /** Live interim caption (not yet final) */
  localCaption: string;
  /** Last confirmed final transcript */
  localFinal: string;
  /** Last translated text we sent */
  localTranslated: string;
  /** Whether mic is actively listening */
  isListening: boolean;
  /** Which STT engine is being used */
  mode: TranscriptionMode;
  /** Any error message */
  error: string | null;
  /** Manually trigger translation of a string (used for testing) */
  translateAndSend: (text: string) => Promise<void>;
}

// ─── Detect browser support ───────────────────────────────────────────────────
function detectMode(): TranscriptionMode {
  if (typeof window === "undefined") return "unavailable";
  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    return "webspeech";
  if ("MediaRecorder" in window) return "whisper";
  return "unavailable";
}

// ─── Translation helper ───────────────────────────────────────────────────────
async function translate(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  if (!text.trim() || from === to) return text;

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), from, to }),
    });

    if (!res.ok) {
      console.warn("[transcription] Translate API error:", res.status);
      return null;
    }

    const data = await res.json();
    return data.translated ?? data.translation ?? null;
  } catch (e) {
    console.warn("[transcription] Translate fetch failed:", e);
    return null;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useTranscription({
  myLanguage,
  theirLanguage,
  localStream,
  sendMessage,
  isActive,
}: UseTranscriptionOptions): UseTranscriptionReturn {
  const [localCaption, setLocalCaption] = useState("");
  const [localFinal, setLocalFinal] = useState("");
  const [localTranslated, setLocalTranslated] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = useRef<TranscriptionMode>("unavailable");
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const isRunRef = useRef(false);
  const langRef = useRef({ my: myLanguage, their: theirLanguage });

  // Keep language refs fresh without restarting listeners
  useEffect(() => {
    langRef.current = { my: myLanguage, their: theirLanguage };
  }, [myLanguage, theirLanguage]);

  // ── Translate + broadcast ────────────────────────────────────────────────────
  const translateAndSend = useCallback(
    async (rawText: string) => {
      const { my, their } = langRef.current;
      const trimmed = rawText.trim();
      if (!trimmed) return;

      // Always broadcast raw transcript (for Cyrano on remote side)
      sendMessage(
        JSON.stringify({ type: "transcription", text: trimmed, lang: my }),
      );

      // Translate and broadcast translation (for subtitle display on remote side)
      const translated = await translate(trimmed, my, their);
      if (translated && translated !== trimmed) {
        setLocalTranslated(translated);
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: translated,
            original: trimmed,
            from: my,
            to: their,
          }),
        );
      } else if (translated) {
        // Same language or passthrough
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: trimmed,
            original: trimmed,
            from: my,
            to: their,
          }),
        );
      }
    },
    [sendMessage],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 1: Web Speech API (Chrome / Edge)
  // ─────────────────────────────────────────────────────────────────────────────
  const startWebSpeech = useCallback(() => {
    const SR: SpeechRecognitionConstructor | undefined =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec: SpeechRecognitionInstance = new SR();

    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = SPEECH_LANG_MAP[langRef.current.my] ?? "en-US";

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let finalChunk = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalChunk += t;
        } else {
          interim += t;
        }
      }

      if (interim) setLocalCaption(interim);

      if (finalChunk.trim()) {
        const final = finalChunk.trim();
        setLocalCaption("");
        setLocalFinal(final);
        translateAndSend(final); // fire-and-forget — no await needed
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are benign — ignore
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") {
        setError("Microphone access denied. Allow mic permission and reload.");
        setIsListening(false);
        return;
      }
      console.warn("[STT] Web Speech error:", e.error);
      setError(`Speech recognition error: ${e.error}`);
    };

    rec.onend = () => {
      setLocalCaption("");
      // Auto-restart if still supposed to be running
      if (isRunRef.current) {
        try {
          rec.start();
        } catch {
          /* browser already restarting */
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {
      setError("Could not start microphone. Check browser permissions.");
    }
  }, [translateAndSend]);

  const stopWebSpeech = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
    setLocalCaption("");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 2: MediaRecorder → Whisper (Safari / Firefox)
  // ─────────────────────────────────────────────────────────────────────────────
  const startWhisper = useCallback(async () => {
    // Get audio stream — prefer localStream (already acquired), fallback to getUserMedia
    let stream: MediaStream;
    if (localStream && localStream.getAudioTracks().length > 0) {
      // Clone just the audio tracks to avoid interfering with WebRTC stream
      stream = new MediaStream(localStream.getAudioTracks());
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } catch {
        setError("Microphone access denied.");
        return;
      }
    }

    // Pick best supported MIME type
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;

    const chunks: Blob[] = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mr.onstop = async () => {
      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
      chunks.length = 0; // clear for next chunk

      // Skip tiny blobs (< 1KB = silence)
      if (blob.size < 1024) return;

      try {
        const form = new FormData();
        form.append("audio", blob, "chunk.webm");
        form.append("language", langRef.current.my);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          if (res.status === 501) {
            setError(
              "Whisper not configured. Add OPENAI_API_KEY for Safari/Firefox support.",
            );
          }
          return;
        }

        const data = await res.json();
        const text = (data.text ?? "").trim();

        if (text) {
          setLocalFinal(text);
          translateAndSend(text);
        }
      } catch (e) {
        console.warn("[STT] Whisper chunk failed:", e);
      }

      // Restart recording if still active
      if (isRunRef.current && mrRef.current?.state !== "recording") {
        try {
          mrRef.current?.start(WHISPER_CHUNK_MS);
        } catch {
          /* stream ended */
        }
      }
    };

    mr.onstart = () => {
      setIsListening(true);
      setError(null);
    };
    mr.onerror = () => {
      setError("Recording error. Please reload.");
    };

    // Record in small chunks for faster transcription (1.5s vs 4s)
    mr.start(WHISPER_CHUNK_MS);
  }, [localStream, translateAndSend]);

  const stopWhisper = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== "inactive") {
      try {
        mrRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    mrRef.current = null;
    setIsListening(false);
    setLocalCaption("");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle: start/stop based on isActive
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    mode.current = detectMode();

    if (isActive) {
      isRunRef.current = true;
      setError(null);

      if (mode.current === "webspeech") {
        startWebSpeech();
      } else if (mode.current === "whisper") {
        startWhisper();
      } else {
        setError(
          "Your browser does not support speech recognition. Use Chrome or Edge for best experience.",
        );
      }
    } else {
      isRunRef.current = false;

      if (mode.current === "webspeech") stopWebSpeech();
      else stopWhisper();

      setLocalCaption("");
    }

    return () => {
      isRunRef.current = false;
      if (mode.current === "webspeech") stopWebSpeech();
      else stopWhisper();
    };
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // When language changes mid-call, restart recognition with new language
  useEffect(() => {
    if (!isActive || !isRunRef.current) return;
    if (mode.current === "webspeech") {
      // Restart Web Speech with new language tag
      stopWebSpeech();
      setTimeout(startWebSpeech, 200);
    }
    // Whisper uses language param per-chunk — no restart needed
  }, [myLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    localCaption,
    localFinal,
    localTranslated,
    isListening,
    mode: mode.current,
    error,
    translateAndSend,
  };
}

export default useTranscription;
