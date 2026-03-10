"use client";

/**
 * CyranoMode — Real-Time Conversation Intelligence UI
 *
 * Floating overlay that whispers exactly what to say.
 * Works on video calls, phone calls, or any live conversation.
 *
 * Aesthetic: Dark glass + electric amber — tactical, premium, focused
 *
 * @version 1.0.0
 */

import { useState, useEffect, useRef } from "react";
import {
  useCyrano,
  CyranoMode,
  Suggestion,
  TranscriptEntry,
} from "../lib/useCyrano";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const MODES: { id: CyranoMode; label: string; emoji: string; color: string }[] =
  [
    { id: "date", label: "Date", emoji: "🔥", color: "#f97316" },
    { id: "interview", label: "Interview", emoji: "💼", color: "#3b82f6" },
    { id: "hardtalk", label: "Hard Talk", emoji: "⚖️", color: "#8b5cf6" },
    { id: "sales", label: "Sales", emoji: "🎯", color: "#10b981" },
  ];

const TONE_COLORS: Record<string, string> = {
  bold: "#f59e0b",
  warm: "#ec4899",
  safe: "#64748b",
};

// ═══════════════════════════════════════════════════════════════════════
// SUGGESTION CARD
// ═══════════════════════════════════════════════════════════════════════

function SuggestionCard({
  suggestion,
  index,
  onSelect,
}: {
  suggestion: Suggestion;
  index: number;
  onSelect: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const color = TONE_COLORS[suggestion.tone];

  const handleSelect = () => {
    navigator.clipboard.writeText(suggestion.text).catch(() => {});
    onSelect(suggestion.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={handleSelect}
      style={{
        animation: `slideUp 0.25s ease ${index * 0.07}s both`,
        borderLeft: `3px solid ${color}`,
      }}
      className="group relative bg-white/[0.04] hover:bg-white/[0.08] border border-white/10
                 rounded-xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.01]
                 hover:border-white/20 active:scale-[0.99]"
    >
      {/* Tone badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{suggestion.emoji}</span>
          <span
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color }}
          >
            {suggestion.label}
          </span>
        </div>

        {/* Copy indicator */}
        <div
          className="text-xs transition-all duration-200"
          style={{ color: copied ? "#10b981" : "rgba(255,255,255,0.3)" }}
        >
          {copied ? "✓ Copied" : "tap to copy"}
        </div>
      </div>

      {/* Suggestion text */}
      <p className="text-white/90 text-sm leading-relaxed font-light">
        {suggestion.text}
      </p>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100
                   transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 20px ${color}10` }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// THINKING INDICATOR
// ═══════════════════════════════════════════════════════════════════════

function ThinkingDots() {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-amber-400"
            style={{
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-white/40 text-xs tracking-wide">Thinking...</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// TRANSCRIPT LINE
// ═══════════════════════════════════════════════════════════════════════

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  const isYou = entry.speaker === "you";
  return (
    <div
      className={`flex gap-2 text-xs ${isYou ? "opacity-50" : "opacity-80"}`}
    >
      <span
        className={`font-semibold shrink-0 ${isYou ? "text-white/60" : "text-amber-400"}`}
      >
        {isYou ? "YOU" : "THEM"}
      </span>
      <span className="text-white/70 leading-relaxed">{entry.text}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MANUAL INPUT (for typing what they said)
// ═══════════════════════════════════════════════════════════════════════

function ManualInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="Type what they just said..."
        className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2
                   text-white/80 text-xs placeholder:text-white/25 outline-none
                   focus:border-amber-400/50 focus:bg-white/[0.08] transition-all"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className="px-3 py-2 bg-amber-400 disabled:bg-white/10 rounded-lg text-black
                   disabled:text-white/30 text-xs font-bold transition-all
                   hover:bg-amber-300 disabled:cursor-not-allowed"
      >
        →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN CYRANO OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════════════════

interface CyranoOverlayProps {
  /** Pass true when embedded in VideoCallPage */
  compact?: boolean;
  /** Called when user selects a suggestion (e.g. for display overlay) */
  onSuggestionSelected?: (text: string) => void;
}

export default function CyranoOverlay({
  compact = false,
  onSuggestionSelected,
}: CyranoOverlayProps) {
  const {
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
  } = useCyrano("date");

  const [showTranscript, setShowTranscript] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const activeMode = MODES.find((m) => m.id === currentMode)!;

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const handleSuggestionSelect = (text: string) => {
    onSuggestionSelected?.(text);
    // Add it to YOUR side of the transcript
  };

  // ── Collapsed state ────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsCollapsed(false)}
          style={{
            background: `linear-gradient(135deg, ${activeMode.color}ee, ${activeMode.color}99)`,
            boxShadow: `0 0 24px ${activeMode.color}66, 0 4px 16px rgba(0,0,0,0.4)`,
          }}
          className="w-14 h-14 rounded-2xl flex items-center justify-center
                     text-2xl shadow-2xl hover:scale-110 transition-transform"
        >
          {isThinking ? "🌀" : activeMode.emoji}
        </button>

        {/* Pulse ring when thinking */}
        {isThinking && (
          <div
            className="absolute inset-0 rounded-2xl animate-ping opacity-30"
            style={{ background: activeMode.color }}
          />
        )}
      </div>
    );
  }

  // ── Full panel ─────────────────────────────────────────────────────
  return (
    <>
      {/* Inject keyframe animations */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      <div
        className={`
          fixed z-50 flex flex-col gap-0
          ${
            compact
              ? "bottom-4 right-4 w-[340px]"
              : "bottom-6 right-6 w-[360px]"
          }
        `}
        style={{ animation: "fadeIn 0.3s ease" }}
      >
        {/* ── MAIN PANEL ────────────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(8, 8, 12, 0.92)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          {/* ── HEADER ─────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: `linear-gradient(90deg, ${activeMode.color}12, transparent)`,
            }}
          >
            <div className="flex items-center gap-2">
              {/* Status dot */}
              <div className="relative flex items-center">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isListening
                      ? "bg-green-400"
                      : isActive
                        ? "bg-amber-400"
                        : "bg-white/20"
                  }`}
                />
                {isListening && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping opacity-50" />
                )}
              </div>

              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: activeMode.color }}
              >
                Cyrano
              </span>

              {isActive && (
                <span className="text-xs text-white/30">
                  {activeMode.emoji} {activeMode.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Transcript toggle */}
              {isActive && (
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60
                             hover:bg-white/[0.06] transition-all text-xs"
                  title="Toggle transcript"
                >
                  📝
                </button>
              )}

              {/* Collapse */}
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg text-white/30 hover:text-white/60
                           hover:bg-white/[0.06] transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 9L7 4L12 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* ── MODE SELECTOR ──────────────────────────────────────── */}
          {!isActive && (
            <div className="p-4 flex flex-col gap-3">
              <p className="text-white/40 text-xs text-center tracking-wide">
                Select your mode to start
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setMode(mode.id)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl
                               border transition-all duration-200 text-center"
                    style={{
                      borderColor:
                        currentMode === mode.id
                          ? `${mode.color}60`
                          : "rgba(255,255,255,0.06)",
                      background:
                        currentMode === mode.id
                          ? `${mode.color}15`
                          : "rgba(255,255,255,0.02)",
                      boxShadow:
                        currentMode === mode.id
                          ? `0 0 20px ${mode.color}20`
                          : "none",
                    }}
                  >
                    <span className="text-xl">{mode.emoji}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color:
                          currentMode === mode.id
                            ? mode.color
                            : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {mode.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Activate button */}
              <button
                onClick={activate}
                className="w-full py-3 rounded-xl font-bold text-sm tracking-wide
                           transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${activeMode.color}, ${activeMode.color}bb)`,
                  color: "#000",
                  boxShadow: `0 4px 20px ${activeMode.color}44`,
                }}
              >
                Activate Cyrano {activeMode.emoji}
              </button>
            </div>
          )}

          {/* ── ACTIVE STATE ───────────────────────────────────────── */}
          {isActive && (
            <div className="flex flex-col gap-0">
              {/* Mode tabs */}
              <div
                className="flex px-3 pt-3 gap-1"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setMode(mode.id)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg
                               text-xs transition-all duration-200 mb-2"
                    style={{
                      background:
                        currentMode === mode.id
                          ? `${mode.color}20`
                          : "transparent",
                      color:
                        currentMode === mode.id
                          ? mode.color
                          : "rgba(255,255,255,0.25)",
                      fontWeight: currentMode === mode.id ? 700 : 400,
                    }}
                  >
                    <span>{mode.emoji}</span>
                    <span className="tracking-wide">{mode.label}</span>
                  </button>
                ))}
              </div>

              {/* Live caption bar */}
              {liveCaption && (
                <div className="mx-3 my-2 px-3 py-2 bg-white/[0.04] rounded-lg">
                  <span className="text-white/40 text-xs italic">
                    🎤 {liveCaption}
                  </span>
                </div>
              )}

              {/* Manual input */}
              <div
                className="px-3 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <ManualInput onSubmit={addTheirLine} />
                <p className="text-white/20 text-xs mt-1.5 text-center">
                  Type what they said · mic auto-captures your side
                </p>
              </div>

              {/* Suggestions area */}
              <div className="p-3 flex flex-col gap-2 min-h-[120px]">
                {isThinking && <ThinkingDots />}

                {!isThinking && suggestions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="text-2xl opacity-30">
                      {activeMode.emoji}
                    </div>
                    <p className="text-white/25 text-xs text-center max-w-[200px]">
                      Suggestions appear after they speak. Type their message
                      above or talk — Cyrano&apos;s listening.
                    </p>
                  </div>
                )}

                {!isThinking &&
                  suggestions.map((suggestion, i) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      index={i}
                      onSelect={handleSuggestionSelect}
                    />
                  ))}

                {suggestions.length > 0 && (
                  <button
                    onClick={dismissSuggestions}
                    className="text-white/20 text-xs text-center py-1
                               hover:text-white/40 transition-colors"
                  >
                    dismiss
                  </button>
                )}
              </div>

              {/* Error state */}
              {error && (
                <div
                  className="mx-3 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20
                               rounded-lg text-red-400 text-xs"
                >
                  {error}
                </div>
              )}

              {/* Footer */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isListening ? "bg-green-400 animate-pulse" : "bg-white/20"
                    }`}
                  />
                  <span className="text-white/30 text-xs">
                    {isListening ? "Listening" : "Mic off"}
                  </span>
                </div>

                <div className="flex gap-2">
                  {transcript.length > 0 && (
                    <button
                      onClick={clearTranscript}
                      className="text-white/25 hover:text-white/50 text-xs transition-colors"
                    >
                      clear
                    </button>
                  )}
                  <button
                    onClick={deactivate}
                    className="text-red-400/60 hover:text-red-400 text-xs transition-colors"
                  >
                    stop
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── TRANSCRIPT DRAWER ────────────────────────────────────── */}
        {isActive && showTranscript && transcript.length > 0 && (
          <div
            className="mt-2 rounded-2xl p-3 flex flex-col gap-2 max-h-[200px] overflow-y-auto"
            ref={transcriptRef}
            style={{
              background: "rgba(8, 8, 12, 0.88)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
              animation: "slideUp 0.2s ease",
            }}
          >
            <p className="text-white/20 text-xs font-semibold tracking-widest uppercase">
              Transcript
            </p>
            {transcript.map((entry, i) => (
              <TranscriptLine key={`${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// STANDALONE PAGE WRAPPER (for /cyrano route)
// ═══════════════════════════════════════════════════════════════════════

export function CyranoPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 20% 50%, #1a0a00 0%, #050508 60%)",
        fontFamily:
          "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Hero text */}
      <div
        className="text-center mb-8 px-6"
        style={{ animation: "fadeIn 0.6s ease" }}
      >
        <div className="text-5xl mb-4">🎭</div>
        <h1
          className="text-3xl font-bold mb-3"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Cyrano Mode
        </h1>
        <p className="text-white/40 text-sm max-w-xs mx-auto leading-relaxed">
          Real-time AI that tells you exactly what to say — on dates,
          interviews, hard conversations, and sales calls.
        </p>
      </div>

      {/* The overlay renders over everything */}
      <CyranoOverlay />

      {/* Demo scene / placeholder content */}
      <div
        className="w-full max-w-md mx-4 rounded-2xl overflow-hidden relative"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          minHeight: "320px",
        }}
      >
        <div className="flex flex-col items-center justify-center h-80 gap-3">
          <div
            className="w-20 h-20 rounded-full"
            style={{
              background: "linear-gradient(135deg, #f97316, #ec4899)",
              opacity: 0.3,
            }}
          />
          <p className="text-white/20 text-sm">Your call goes here</p>
          <p className="text-white/15 text-xs">
            Cyrano listens in the background ↘
          </p>
        </div>
      </div>
    </div>
  );
}
