/**
 * useWingman.ts — Master orchestrator for Wingman (EarMode) sessions
 *
 * DATA FLOW:
 *   Mic → STT (WebSpeech or Whisper)
 *       → Cyrano API (generates 3 suggestions)
 *       → TTS (whispers best/selected suggestion to AirPods)
 *       → Screen (shows suggestions for tap selection)
 *
 * OUTPUT MODES:
 *   'ear'   — TTS whispers suggestion automatically
 *   'eye'   — shows suggestions on screen, silent
 *   'text'  — partner types, you hear/see the response
 *   'auto'  — switches ear↔text based on ambient noise
 *
 * @version 1.0.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionInstance,
} from "@/app/lib/speech-types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type CyranoMode = "date" | "interview" | "hardtalk" | "sales";
export type OutputMode = "ear" | "eye" | "text" | "auto";
export type SessionPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "error";

export interface WingmanSuggestion {
  id: string;
  text: string;
  tone: "bold" | "warm" | "safe";
  label: string;
  emoji: string;
}

export interface TranscriptLine {
  speaker: "them" | "you";
  text: string;
  timestamp: number;
  translated?: string;
}

export interface UseWingmanOptions {
  cyranoMode: CyranoMode;
  outputMode: OutputMode;
  myLanguage: string;
  theirLanguage: string;
  autoTextModeActive: boolean; // from useAmbientNoise
  onSpeak: (text: string) => void; // from useTTS
}

export interface UseWingmanReturn {
  phase: SessionPhase;
  transcript: TranscriptLine[];
  suggestions: WingmanSuggestion[];
  lastTheirText: string;
  isListening: boolean;
  isThinking: boolean;
  error: string | null;
  // Actions
  start: () => void;
  stop: () => void;
  selectSuggestion: (s: WingmanSuggestion) => void;
  addTheirText: (text: string) => void; // for text mode
  clearTranscript: () => void;
  dismissSuggestions: () => void;
}

// ─── Cyrano prompts ───────────────────────────────────────────────────────────
const MODE_PROMPTS: Record<CyranoMode, string> = {
  date: `You are a real-time dating coach whispering in someone's ear. They're on a date with someone they like.
Generate 3 response suggestions based on what the other person just said.
BOLD: Confident, flirty, creates tension. WARM: Genuine, emotionally present. SAFE: Engaging but low-risk.
Rules: 1-2 sentences max. Sound completely natural, like they thought of it. Reference what was said.`,

  interview: `You are a real-time interview coach whispering in someone's ear during a live job interview.
Generate 3 response suggestions for what the interviewer just said.
BOLD: Memorable, shows leadership. WARM: Story-driven, authentic. SAFE: Polished, textbook strong.
Rules: 3-4 sentences. Use STAR method when appropriate. Sound confident, not scripted.`,

  hardtalk: `You are a conflict resolution coach whispering during a difficult real-world conversation.
Generate 3 responses to what the other person just said.
BOLD: Direct, honest, non-aggressive. WARM: Empathetic, validates their point. SAFE: Calm, de-escalating.
Rules: Acknowledge before responding. Never passive-aggressive. Sound human, not therapeutic.`,

  sales: `You are a sales coach whispering during a live sales call or pitch.
Generate 3 responses to what the prospect just said.
BOLD: Pattern interrupt, reframe objection. WARM: Empathy + value. SAFE: Classic objection handling.
Rules: Reference their exact words. Never manipulative. Short enough to remember while speaking.`,
};

// ─── Fetch with timeout for mobile networks ──────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── BCP-47 speech lang map ───────────────────────────────────────────────────
const SPEECH_LANG_MAP: Record<string, string> = {
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

export function useWingman({
  cyranoMode,
  outputMode,
  myLanguage,
  theirLanguage,
  autoTextModeActive,
  onSpeak,
}: UseWingmanOptions): UseWingmanReturn {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [suggestions, setSuggestions] = useState<WingmanSuggestion[]>([]);
  const [lastTheirText, setLastTheirText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRunRef = useRef(false);
  const modeRef = useRef({
    cyrano: cyranoMode,
    output: outputMode,
    my: myLanguage,
    their: theirLanguage,
  });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Keep mode refs fresh
  useEffect(() => {
    modeRef.current = {
      cyrano: cyranoMode,
      output: outputMode,
      my: myLanguage,
      their: theirLanguage,
    };
  }, [cyranoMode, outputMode, myLanguage, theirLanguage]);

  // ── Fetch Cyrano suggestions ─────────────────────────────────────────────
  const fetchSuggestions = useCallback(
    async (theirText: string) => {
      if (!theirText.trim()) return;
      setIsThinking(true);
      setPhase("thinking");
      setSuggestions([]);

      const { cyrano, my, their } = modeRef.current;

      // Translate their text into my language for context if needed
      let displayText = theirText;
      if (my !== their) {
        try {
          const r = await fetchWithTimeout(
            "/api/translate",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: theirText, from: their, to: my }),
            },
            8000, // 8s timeout for translation
          );
          if (r.ok) {
            const d = await r.json();
            displayText = d.translated ?? theirText;
          }
        } catch {
          /* use original on timeout or error */
        }
      }

      // Get context from recent transcript
      const lines = transcript
        .slice(-6)
        .map((l) => `${l.speaker === "you" ? "YOU" : "THEM"}: ${l.text}`)
        .join("\n");

      const userPrompt = `CONVERSATION CONTEXT:
${lines || "(start of conversation)"}

THEY JUST SAID: "${displayText}"

Generate exactly 3 suggestions. Return ONLY valid JSON:
{"suggestions":[
  {"tone":"bold","label":"Bold","emoji":"⚡","text":"..."},
  {"tone":"warm","label":"Warm","emoji":"💛","text":"..."},
  {"tone":"safe","label":"Safe","emoji":"🛡️","text":"..."}
]}`;

      try {
        const res = await fetchWithTimeout(
          "/api/cyrano",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemPrompt: MODE_PROMPTS[cyrano],
              userPrompt,
            }),
          },
          15000, // 15s timeout for AI generation
        );
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        const parsed = JSON.parse(data.content);
        const svs: WingmanSuggestion[] = parsed.suggestions.map(
          (s: Omit<WingmanSuggestion, "id">) => ({
            ...s,
            id: `${Date.now()}-${s.tone}`,
          }),
        );
        setSuggestions(svs);
        setPhase("responding");

        // Auto-speak the warm suggestion in ear mode
        const activeOutput = modeRef.current.output;
        const shouldAutoSpeak =
          activeOutput === "ear" ||
          (activeOutput === "auto" && !autoTextModeActive);
        if (shouldAutoSpeak) {
          const warm = svs.find((s) => s.tone === "warm") ?? svs[0];
          if (warm) onSpeak(warm.text);
        }
      } catch (e) {
        setError("Suggestions unavailable");
        setPhase("error");
      } finally {
        setIsThinking(false);
      }
    },
    [transcript, autoTextModeActive, onSpeak],
  );

  // ── Add their line (text mode or auto-called from STT) ───────────────────
  const addTheirText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const line: TranscriptLine = {
        speaker: "them",
        text: text.trim(),
        timestamp: Date.now(),
      };
      setTranscript((prev) => [...prev, line]);
      setLastTheirText(text.trim());
      setError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => fetchSuggestions(text.trim()),
        600,
      );
    },
    [fetchSuggestions],
  );

  // ── Web Speech STT ───────────────────────────────────────────────────────
  const startSTT = useCallback(() => {
    // SSR guard - window doesn't exist on server
    if (typeof window === "undefined") return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = SPEECH_LANG_MAP[modeRef.current.their] ?? "es-ES";

    rec.onstart = () => {
      setIsListening(true);
      setPhase("listening");
      setError(null);
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final.trim()) addTheirText(final.trim());
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") {
        setError("Mic access denied");
        setIsListening(false);
        return;
      }
      console.warn("[Wingman STT]", e.error);
    };

    rec.onend = () => {
      if (isRunRef.current) {
        try {
          rec.start();
        } catch {
          /* already restarting */
        }
      } else {
        setIsListening(false);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {
      /* ignore */
    }
  }, [addTheirText]);

  const stopSTT = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
  }, []);

  // ── Session control ──────────────────────────────────────────────────────
  const start = useCallback(() => {
    isRunRef.current = true;
    setError(null);
    setSuggestions([]);
    setLastTheirText("");

    // Don't auto-start STT in pure text mode
    const activeOutput = modeRef.current.output;
    if (activeOutput !== "text") {
      startSTT();
    } else {
      setPhase("listening");
    }
  }, [startSTT]);

  const stop = useCallback(() => {
    isRunRef.current = false;
    stopSTT();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPhase("idle");
    setIsListening(false);
    setIsThinking(false);
  }, [stopSTT]);

  // ── Auto-switch STT when noise crosses threshold ─────────────────────────
  useEffect(() => {
    if (!isRunRef.current) return;
    if (outputMode === "auto") {
      if (autoTextModeActive && isListening) stopSTT();
      else if (!autoTextModeActive && !isListening) startSTT();
    }
  }, [autoTextModeActive, outputMode, isListening, startSTT, stopSTT]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  const selectSuggestion = useCallback(
    (s: WingmanSuggestion) => {
      setTranscript((prev) => [
        ...prev,
        { speaker: "you", text: s.text, timestamp: Date.now() },
      ]);
      onSpeak(s.text);
      setSuggestions([]);
      setPhase("listening");
    },
    [onSpeak],
  );

  return {
    phase,
    transcript,
    suggestions,
    lastTheirText,
    isListening,
    isThinking,
    error,
    start,
    stop,
    selectSuggestion,
    addTheirText,
    clearTranscript: () => {
      setTranscript([]);
      setSuggestions([]);
      setLastTheirText("");
    },
    dismissSuggestions: () => setSuggestions([]),
  };
}

export default useWingman;
