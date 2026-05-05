/**
 * useTranscription.ts — STREAMING REAL-TIME TRANSLATION ENGINE
 *
 * Translates AS you speak — not after. Sub-200ms visual updates.
 *
 * ARCHITECTURE:
 *   Mic → Web Speech API (interim results every ~100ms)
 *       → Client-side instant dictionary (0ms for common phrases)
 *       → Debounced API translation (150ms for interim, immediate for final)
 *       → AbortController cancels stale requests
 *       → Progressive broadcast to partner (live updating subtitles)
 *
 * SPEED TECHNIQUES:
 *   1. Translate INTERIM results (don't wait for pause)
 *   2. Client-side dictionary for zero-latency common words
 *   3. AbortController cancels outdated translation requests
 *   4. Request deduplication (skip if text unchanged)
 *   5. Parallel final translation (bypasses debounce queue)
 *   6. Progressive partner updates (they see words appear live)
 *
 * @version 2.0.0 — Streaming Edition
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
  es: "es-CO",
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
  nl: "nl-NL",
  pl: "pl-PL",
  tr: "tr-TR",
  vi: "vi-VN",
  th: "th-TH",
  sv: "sv-SE",
};

// ─── CLIENT-SIDE INSTANT DICTIONARY ──────────────────────────────────────────
// Zero-latency translation for the most common conversational phrases
// These bypass the API entirely — instant response
const INSTANT_DICT: Record<string, Record<string, string>> = {
  "en-es": {
    hello: "hola", hi: "hola", hey: "oye", yes: "si", no: "no",
    thanks: "gracias", "thank you": "gracias", please: "por favor",
    sorry: "lo siento", "excuse me": "disculpe", okay: "esta bien",
    "good morning": "buenos dias", "good afternoon": "buenas tardes",
    "good night": "buenas noches", "how are you": "como estas",
    "i understand": "entiendo", "i don't understand": "no entiendo",
    "can you repeat": "puede repetir", "nice to meet you": "mucho gusto",
    "see you later": "hasta luego", goodbye: "adios", bye: "adios",
    "what's your name": "como te llamas", "my name is": "me llamo",
    "where are you from": "de donde eres", "i love you": "te quiero",
    "i like it": "me gusta", "very good": "muy bueno", perfect: "perfecto",
    "how much": "cuanto", "the bill please": "la cuenta por favor",
    water: "agua", food: "comida", help: "ayuda", sure: "claro",
    "of course": "por supuesto", maybe: "quizas", "i think so": "creo que si",
    "no problem": "no hay problema", "you're welcome": "de nada",
    "i need help": "necesito ayuda", "do you speak english": "hablas ingles",
    "i don't speak spanish": "no hablo espanol",
    "can you help me": "puedes ayudarme", "where is": "donde esta",
    "what time is it": "que hora es", "i want": "quiero", "i need": "necesito",
    "i would like": "me gustaria", "let's go": "vamos",
    "wait": "espera", "one moment": "un momento", "come here": "ven aqui",
    "over there": "por alla", "how much does it cost": "cuanto cuesta",
    "it's beautiful": "es hermoso", "i'm tired": "estoy cansado",
    "i'm hungry": "tengo hambre", "i'm lost": "estoy perdido",
    "what is this": "que es esto", "i like you": "me gustas",
    "tell me more": "dime mas", "that's interesting": "eso es interesante",
    "really": "en serio", "wow": "guau", "amazing": "increible",
    "let me think": "dejame pensar", "i agree": "estoy de acuerdo",
    "what do you think": "que piensas", "sounds good": "suena bien",
  },
  "es-en": {} as Record<string, string>,
};

// Generate reverse mappings
for (const [phrase, translation] of Object.entries(INSTANT_DICT["en-es"])) {
  INSTANT_DICT["es-en"][translation] = phrase;
}

// Whisper chunk duration
const WHISPER_CHUNK_MS = 1200;

// ─── Types ────────────────────────────────────────────────────────────────────
export type TranscriptionMode = "webspeech" | "whisper" | "unavailable";

export interface UseTranscriptionOptions {
  myLanguage: string;
  theirLanguage: string;
  localStream: MediaStream | null;
  sendMessage: (message: string) => boolean;
  isActive: boolean;
}

export interface UseTranscriptionReturn {
  localCaption: string;
  localFinal: string;
  localTranslated: string;
  isListening: boolean;
  mode: TranscriptionMode;
  error: string | null;
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

// ─── Fast translation with AbortController ───────────────────────────────────
async function translateAPI(
  text: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!text.trim() || from === to) return text;

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.trim(), from, to }),
      signal,
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.translated ?? data.translation ?? null;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return null;
    return null;
  }
}

// ─── Client-side instant lookup ──────────────────────────────────────────────
function instantTranslate(text: string, from: string, to: string): string | null {
  const key = `${from}-${to}`;
  const dict = INSTANT_DICT[key];
  if (!dict) return null;
  return dict[text.toLowerCase().trim()] ?? null;
}

// ─── Translation cache (client-side, avoids repeat API calls) ────────────────
const translationCache = new Map<string, string>();
const MAX_CACHE = 500;

function getCachedTranslation(text: string, from: string, to: string): string | null {
  return translationCache.get(`${from}:${to}:${text.toLowerCase().trim()}`) ?? null;
}

function setCachedTranslation(text: string, from: string, to: string, result: string) {
  const key = `${from}:${to}:${text.toLowerCase().trim()}`;
  translationCache.set(key, result);
  if (translationCache.size > MAX_CACHE) {
    const firstKey = translationCache.keys().next().value;
    if (firstKey) translationCache.delete(firstKey);
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

  // Streaming translation state
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastInterimRef = useRef<string>("");
  const lastSentTextRef = useRef<string>("");

  // Keep language refs fresh
  useEffect(() => {
    langRef.current = { my: myLanguage, their: theirLanguage };
  }, [myLanguage, theirLanguage]);

  // ── STREAMING TRANSLATE — translates interim text with cancellation ────────
  const streamingTranslate = useCallback(
    async (text: string, isFinal: boolean) => {
      const { my, their } = langRef.current;
      const trimmed = text.trim();
      if (!trimmed) return;

      // Skip if we already sent this exact text
      if (!isFinal && trimmed === lastSentTextRef.current) return;

      // Cancel any in-flight interim translation
      if (abortRef.current) {
        abortRef.current.abort();
      }

      // Always broadcast raw text immediately (partner sees live typing)
      sendMessage(
        JSON.stringify({
          type: "transcription",
          text: trimmed,
          lang: my,
          isFinal,
        }),
      );

      // 1. Try instant dictionary (0ms)
      const instant = instantTranslate(trimmed, my, their);
      if (instant) {
        setLocalTranslated(instant);
        setCachedTranslation(trimmed, my, their, instant);
        lastSentTextRef.current = trimmed;
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: instant,
            original: trimmed,
            from: my,
            to: their,
            isFinal,
          }),
        );
        return;
      }

      // 2. Try client-side cache (0ms)
      const cached = getCachedTranslation(trimmed, my, their);
      if (cached) {
        setLocalTranslated(cached);
        lastSentTextRef.current = trimmed;
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: cached,
            original: trimmed,
            from: my,
            to: their,
            isFinal,
          }),
        );
        return;
      }

      // 3. API translation with AbortController
      const controller = new AbortController();
      abortRef.current = controller;

      const translated = await translateAPI(trimmed, my, their, controller.signal);

      // Check if this request was superseded
      if (controller.signal.aborted) return;

      if (translated) {
        setLocalTranslated(translated);
        setCachedTranslation(trimmed, my, their, translated);
        lastSentTextRef.current = trimmed;
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: translated,
            original: trimmed,
            from: my,
            to: their,
            isFinal,
          }),
        );
      }
    },
    [sendMessage],
  );

  // ── DEBOUNCED INTERIM TRANSLATION ──────────────────────────────────────────
  // Translates while speaking with 150ms debounce (cancels stale requests)
  const translateInterim = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length < 2) return;

      // Skip if text hasn't changed
      if (trimmed === lastInterimRef.current) return;
      lastInterimRef.current = trimmed;

      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Check instant dictionary synchronously (no debounce needed)
      const { my, their } = langRef.current;
      const instant = instantTranslate(trimmed, my, their);
      if (instant) {
        setLocalTranslated(instant);
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: instant,
            original: trimmed,
            from: my,
            to: their,
            isFinal: false,
          }),
        );
        lastSentTextRef.current = trimmed;
        return;
      }

      // Check cache synchronously
      const cached = getCachedTranslation(trimmed, my, their);
      if (cached) {
        setLocalTranslated(cached);
        sendMessage(
          JSON.stringify({
            type: "translation",
            text: cached,
            original: trimmed,
            from: my,
            to: their,
            isFinal: false,
          }),
        );
        lastSentTextRef.current = trimmed;
        return;
      }

      // Debounce API call — 150ms for real-time feel
      debounceRef.current = setTimeout(() => {
        streamingTranslate(trimmed, false);
      }, 150);
    },
    [streamingTranslate, sendMessage],
  );

  // ── FINAL TRANSLATION — immediate, bypasses debounce ───────────────────────
  const translateFinal = useCallback(
    (text: string) => {
      // Cancel any pending interim translation
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      lastInterimRef.current = "";

      // Translate immediately (no debounce)
      streamingTranslate(text, true);
    },
    [streamingTranslate],
  );

  // ── Legacy translateAndSend for external callers ───────────────────────────
  const translateAndSend = useCallback(
    async (rawText: string) => {
      translateFinal(rawText);
    },
    [translateFinal],
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 1: Web Speech API (Chrome / Edge) — STREAMING
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

      // STREAMING: Translate interim results in real-time
      if (interim) {
        setLocalCaption(interim);
        translateInterim(interim);
      }

      // FINAL: Immediate translation, bypasses debounce
      if (finalChunk.trim()) {
        const final = finalChunk.trim();
        setLocalCaption("");
        setLocalFinal(final);
        translateFinal(final);
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
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
  }, [translateInterim, translateFinal]);

  const stopWebSpeech = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
    setLocalCaption("");
    // Cancel any pending translations
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // MODE 2: MediaRecorder + Whisper (Safari / Firefox)
  // ─────────────────────────────────────────────────────────────────────────────
  const startWhisper = useCallback(async () => {
    let stream: MediaStream;
    if (localStream && localStream.getAudioTracks().length > 0) {
      stream = new MediaStream(localStream.getAudioTracks());
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        setError("Microphone access denied.");
        return;
      }
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
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
      chunks.length = 0;

      if (blob.size < 1024) return;

      try {
        const form = new FormData();
        form.append("audio", blob, "chunk.webm");
        form.append("language", langRef.current.my);

        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) {
          if (res.status === 501) {
            setError("Whisper not configured. Add OPENAI_API_KEY for Safari/Firefox.");
          }
          return;
        }

        const data = await res.json();
        const text = (data.text ?? "").trim();
        if (text) {
          setLocalFinal(text);
          translateFinal(text);
        }
      } catch (e) {
        console.warn("[STT] Whisper chunk failed:", e);
      }

      if (isRunRef.current && mrRef.current?.state !== "recording") {
        try { mrRef.current?.start(WHISPER_CHUNK_MS); } catch { /* stream ended */ }
      }
    };

    mr.onstart = () => { setIsListening(true); setError(null); };
    mr.onerror = () => { setError("Recording error. Please reload."); };
    mr.start(WHISPER_CHUNK_MS);
  }, [localStream, translateFinal]);

  const stopWhisper = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== "inactive") {
      try { mrRef.current.stop(); } catch { /* already stopped */ }
    }
    mrRef.current = null;
    setIsListening(false);
    setLocalCaption("");
    if (abortRef.current) abortRef.current.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
      lastInterimRef.current = "";
      lastSentTextRef.current = "";

      if (mode.current === "webspeech") {
        startWebSpeech();
      } else if (mode.current === "whisper") {
        startWhisper();
      } else {
        setError("Your browser does not support speech recognition. Use Chrome or Edge.");
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

  // Restart with new language mid-call
  useEffect(() => {
    if (!isActive || !isRunRef.current) return;
    if (mode.current === "webspeech") {
      stopWebSpeech();
      setTimeout(startWebSpeech, 150);
    }
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
