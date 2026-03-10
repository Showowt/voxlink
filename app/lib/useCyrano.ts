/**
 * useCyrano — Real-Time Conversation Intelligence Hook
 *
 * Listens to both sides of a live call, builds context,
 * and surfaces instant AI-generated response suggestions.
 *
 * Architecture:
 *   Mic Input → Web Speech API → Transcript Buffer
 *                                      ↓
 *                             Debounced Claude API Call
 *                                      ↓
 *                          3 Ranked Suggestions (tone-tiered)
 *
 * @version 1.0.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  SpeechRecognitionInstance,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
} from "./speech-types";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type CyranoMode = "date" | "interview" | "hardtalk" | "sales";

export type SuggestionTone = "bold" | "warm" | "safe";

export interface Suggestion {
  id: string;
  text: string;
  tone: SuggestionTone;
  label: string;
  emoji: string;
}

export interface TranscriptEntry {
  speaker: "you" | "them";
  text: string;
  timestamp: number;
}

export interface UseCyranoReturn {
  // State
  isActive: boolean;
  isListening: boolean;
  isThinking: boolean;
  suggestions: Suggestion[];
  transcript: TranscriptEntry[];
  currentMode: CyranoMode;
  error: string | null;
  liveCaption: string;

  // Controls
  activate: () => void;
  deactivate: () => void;
  setMode: (mode: CyranoMode) => void;
  addTheirLine: (text: string) => void; // For manual input or remote STT
  dismissSuggestions: () => void;
  clearTranscript: () => void;
}

// ═══════════════════════════════════════════════════════════════════════
// MODE SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════

const MODE_PROMPTS: Record<CyranoMode, string> = {
  date: `You are a masterful dating coach and social intelligence expert.
You're listening to a live conversation between the user and someone they're interested in romantically.

Your job: generate 3 response suggestions for what the user should say NEXT based on what was just said.

TONE TIERS (always produce all 3):
- BOLD: Confident, slightly playful, creates tension, shows personality — never try-hard
- WARM: Genuine, curious, emotionally attuned — makes them feel seen
- SAFE: Neutral but engaged — won't rock any boats

RULES:
- Suggestions must be 1-2 sentences MAX — conversational, not a speech
- Match the energy/register of the conversation
- Bold should feel exciting, not gross
- Never suggest anything manipulative or dishonest
- Reference specific things said to show you're listening
- Build towards connection and genuine interest`,

  interview: `You are a top-tier executive interview coach.
You're listening to a live job interview in real-time.

Your job: generate 3 response suggestions for how the candidate should answer what was just asked.

TONE TIERS (always produce all 3):
- BOLD: Memorable, confident, distinctive — makes interviewers remember you
- WARM: Authentic, story-driven, human — builds rapport with the interviewer
- SAFE: Polished, professional, solid — textbook strong but won't surprise

RULES:
- Answers must be concise — max 3-4 sentences
- Use the STAR framework only for behavioral questions
- Show quantified results when possible
- Bold answers take a unique angle that competitors won't take
- Never lie or exaggerate, reframe truthfully`,

  hardtalk: `You are an expert in conflict resolution, non-violent communication, and high-stakes conversations.
You're helping someone navigate a difficult real-time conversation — breakup, confrontation, negotiation, family conflict.

Your job: generate 3 response suggestions based on what was just said.

TONE TIERS (always produce all 3):
- BOLD: Direct, honest, de-escalating through clarity — says the real thing calmly
- WARM: Empathetic, validating, holds the relationship — leads with understanding
- SAFE: Neutral, time-buying, non-reactive — keeps the door open without committing

RULES:
- Prioritize de-escalation over winning
- Acknowledge what was said before responding
- Avoid DARVO (deny, attack, reverse victim and offender) patterns
- Safe responses should never be passive-aggressive
- Warm responses must be genuinely warm, not performative`,

  sales: `You are a world-class sales coach specializing in consultative selling.
You're listening to a live sales call or business conversation in real-time.

Your job: generate 3 response suggestions for the next thing the rep should say.

TONE TIERS (always produce all 3):
- BOLD: Pattern-interrupt, reframe objection, confident close energy — unexpected angle
- WARM: Empathy-first, understand their position, build trust before pushing
- SAFE: Classic objection handling, low-pressure, professional

RULES:
- Never be pushy or manipulative
- Objections are questions in disguise — answer what's underneath
- Bold responses surprise the prospect with insight, not pressure
- Reference their specific words to show active listening
- Move the conversation forward on every response`,
};

// ═══════════════════════════════════════════════════════════════════════
// SUGGESTION GENERATOR
// ═══════════════════════════════════════════════════════════════════════

async function generateSuggestions(
  transcript: TranscriptEntry[],
  mode: CyranoMode,
): Promise<Suggestion[]> {
  // Format the last 6 exchanges for context (keeps tokens low)
  const recentExchanges = transcript
    .slice(-6)
    .map((e) => `${e.speaker === "you" ? "YOU" : "THEM"}: ${e.text}`)
    .join("\n");

  const lastLine = transcript.filter((e) => e.speaker === "them").slice(-1)[0];
  if (!lastLine) return [];

  const userPrompt = `CONVERSATION SO FAR:
${recentExchanges}

THEY JUST SAID: "${lastLine.text}"

Generate exactly 3 response suggestions. Return ONLY valid JSON, no markdown:
{
  "suggestions": [
    {"tone": "bold", "label": "Bold", "emoji": "⚡", "text": "..."},
    {"tone": "warm", "label": "Warm", "emoji": "💛", "text": "..."},
    {"tone": "safe", "label": "Safe", "emoji": "🛡️", "text": "..."}
  ]
}`;

  const response = await fetch("/api/cyrano", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      systemPrompt: MODE_PROMPTS[mode],
      userPrompt,
    }),
  });

  if (!response.ok) throw new Error("Suggestion API failed");

  const data = await response.json();
  const parsed = JSON.parse(data.content);

  return parsed.suggestions.map((s: Omit<Suggestion, "id">) => ({
    ...s,
    id: `${Date.now()}-${s.tone}`,
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════

export function useCyrano(initialMode: CyranoMode = "date"): UseCyranoReturn {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentMode, setCurrentMode] = useState<CyranoMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [liveCaption, setLiveCaption] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const modeRef = useRef<CyranoMode>(initialMode);

  // Keep refs in sync
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    modeRef.current = currentMode;
  }, [currentMode]);

  // Debounced suggestion generation — fires 1.2s after last speech
  const scheduleSuggestions = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const current = transcriptRef.current;
      if (current.length === 0) return;

      const lastEntry = current[current.length - 1];
      if (lastEntry.speaker !== "them") return; // Only trigger after THEY speak

      setIsThinking(true);
      setError(null);

      try {
        const results = await generateSuggestions(current, modeRef.current);
        setSuggestions(results);
      } catch (err) {
        setError("Failed to generate suggestions. Check your connection.");
        console.error("[Cyrano] Suggestion error:", err);
      } finally {
        setIsThinking(false);
      }
    }, 1200);
  }, []);

  // Add a line from the other person (called from STT or manual input)
  const addTheirLine = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const entry: TranscriptEntry = {
        speaker: "them",
        text: text.trim(),
        timestamp: Date.now(),
      };

      setTranscript((prev) => [...prev, entry]);
      setLiveCaption("");
      scheduleSuggestions();
    },
    [scheduleSuggestions],
  );

  // Speech recognition for YOUR side + caption detection
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError("Speech recognition requires Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) setLiveCaption(interim);

      if (final.trim()) {
        setLiveCaption("");
        const entry: TranscriptEntry = {
          speaker: "you",
          text: final.trim(),
          timestamp: Date.now(),
        };
        setTranscript((prev) => [...prev, entry]);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech") return; // Normal, don't surface
      if (event.error === "aborted") return;
      setError(`Mic error: ${event.error}`);
    };

    recognition.onend = () => {
      // Auto-restart if still active
      if (recognitionRef.current === recognition && isActive) {
        try {
          recognition.start();
        } catch {
          /* Already started */
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setError("Could not access microphone.");
    }
  }, [isActive]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveCaption("");
  }, []);

  const activate = useCallback(() => {
    setIsActive(true);
    setSuggestions([]);
    setTranscript([]);
    setError(null);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    stopListening();
    setSuggestions([]);
    setLiveCaption("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [stopListening]);

  const setMode = useCallback((mode: CyranoMode) => {
    setCurrentMode(mode);
    setSuggestions([]); // Clear stale suggestions on mode switch
  }, []);

  const dismissSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setSuggestions([]);
  }, []);

  // Start/stop listening when active state changes
  useEffect(() => {
    if (isActive) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [isActive]); // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []); // eslint-disable-line

  return {
    isActive,
    isListening,
    isThinking,
    suggestions,
    transcript,
    currentMode,
    error,
    liveCaption,
    activate,
    deactivate,
    setMode,
    addTheirLine,
    dismissSuggestions,
    clearTranscript,
  };
}
