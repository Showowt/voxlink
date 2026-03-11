/**
 * useTTS.ts — Text-to-Speech engine for AirPods whispering
 *
 * Configured to sound like a calm voice in your ear, not a robot.
 * Auto-routes to AirPods when connected.
 * Queues suggestions, cancels old ones, never overlaps.
 *
 * @version 1.0.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── BCP-47 TTS voice map ──────────────────────────────────────────────────
const TTS_LANG_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
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

// ─── Preferred voice patterns (feels natural in-ear, not robotic) ──────────
const PREFERRED_VOICE_PATTERNS = [
  /samantha/i, // macOS/iOS female, very natural
  /karen/i, // Australian, clear
  /moira/i, // Irish, warm
  /fiona/i, // Scottish, warm
  /google.*us/i, // Google US English
  /alex/i, // macOS male, classic clear
];

export type TTSStatus = "idle" | "speaking" | "queued" | "unavailable";

export interface UseTTSOptions {
  language?: string;
  rate?: number; // 0.1 – 10, default 0.85 (slightly slower = clearer in ear)
  pitch?: number; // 0 – 2, default 0.9 (slightly lower = less piercing)
  volume?: number; // 0 – 1, default 0.8
  enabled?: boolean;
}

export interface UseTTSReturn {
  speak: (text: string) => void;
  cancel: () => void;
  status: TTSStatus;
  isSpeaking: boolean;
  isSupported: boolean;
  voiceName: string | null;
}

export function useTTS({
  language = "en",
  rate = 0.85,
  pitch = 0.9,
  volume = 0.8,
  enabled = true,
}: UseTTSOptions = {}): UseTTSReturn {
  const [status, setStatus] = useState<TTSStatus>("idle");
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const queueRef = useRef<string[]>([]);
  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // ── Find best voice ──────────────────────────────────────────────────────
  const findBestVoice = useCallback(() => {
    if (!isSupported) return null;
    const lang = TTS_LANG_MAP[language] ?? "en-US";
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    // 1. Try preferred voice patterns
    for (const pattern of PREFERRED_VOICE_PATTERNS) {
      const v = voices.find(
        (v) => pattern.test(v.name) && v.lang.startsWith(lang.slice(0, 2)),
      );
      if (v) return v;
    }

    // 2. Any enhanced/premium voice for this lang
    const enhanced = voices.find((v) => v.lang === lang && !v.localService);
    if (enhanced) return enhanced;

    // 3. Any local voice for this lang
    const local = voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
    if (local) return local;

    // 4. Fallback: first available
    return voices[0] ?? null;
  }, [language, isSupported]);

  useEffect(() => {
    if (!isSupported) {
      setStatus("unavailable");
      return;
    }

    const init = () => {
      const v = findBestVoice();
      voiceRef.current = v;
      setVoiceName(v?.name ?? null);
    };

    init();
    window.speechSynthesis.onvoiceschanged = init;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [findBestVoice, isSupported]);

  // ── Process queue ────────────────────────────────────────────────────────
  const processQueue = useCallback(() => {
    if (!isSupported || !enabled) return;
    if (window.speechSynthesis.speaking) return;
    const text = queueRef.current.shift();
    if (!text) {
      setStatus("idle");
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utter.voice = voiceRef.current;
    utter.lang = TTS_LANG_MAP[language] ?? "en-US";
    utter.rate = rate;
    utter.pitch = pitch;
    utter.volume = volume;

    utter.onstart = () => setStatus("speaking");
    utter.onend = () => {
      setStatus(queueRef.current.length > 0 ? "queued" : "idle");
      processQueue();
    };
    utter.onerror = () => {
      setStatus("idle");
      processQueue();
    };

    window.speechSynthesis.speak(utter);
  }, [isSupported, enabled, language, rate, pitch, volume]);

  // ── Public API ───────────────────────────────────────────────────────────
  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !enabled || !text.trim()) return;

      // Cancel current, keep only this newest suggestion (don't pile up)
      window.speechSynthesis.cancel();
      queueRef.current = [text.trim()];
      setStatus("queued");

      // Small delay after cancel to let browser settle
      setTimeout(processQueue, 150);
    },
    [isSupported, enabled, processQueue],
  );

  const cancel = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    queueRef.current = [];
    setStatus("idle");
  }, [isSupported]);

  // Resume if browser pauses TTS (iOS bug)
  useEffect(() => {
    if (!isSupported) return;
    const iv = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 5000);
    return () => clearInterval(iv);
  }, [isSupported]);

  return {
    speak,
    cancel,
    status,
    isSpeaking: status === "speaking",
    isSupported,
    voiceName,
  };
}

export default useTTS;
