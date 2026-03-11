"use client";

/**
 * VoxLink — Wingman Mode
 * ──────────────────────
 * Your AI co-pilot whispers what to say in real time.
 * Works in AirPods (ear mode), on-screen (eye mode), or
 * auto-switches to text when you're at a bar or concert.
 *
 * @route /wingman
 * @version 1.0.0
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTTS } from "@/hooks/useTTS";
import { useAmbientNoise } from "@/hooks/useAmbientNoise";
import { useWingman } from "@/hooks/useWingman";
import type {
  CyranoMode,
  OutputMode,
  WingmanSuggestion,
} from "@/hooks/useWingman";

// ── Constants ──────────────────────────────────────────────────────────────────
const CYRANO_MODES: {
  id: CyranoMode;
  label: string;
  emoji: string;
  desc: string;
}[] = [
  {
    id: "date",
    label: "Date",
    emoji: "💘",
    desc: "First dates. Crushes. Spark.",
  },
  {
    id: "interview",
    label: "Interview",
    emoji: "🎯",
    desc: "Jobs. Raises. Pitches.",
  },
  {
    id: "hardtalk",
    label: "Hard Talk",
    emoji: "🌊",
    desc: "Conflict. Honesty. Repair.",
  },
  { id: "sales", label: "Sales", emoji: "⚡", desc: "Close. Handle. Convert." },
];

const OUTPUT_MODES: {
  id: OutputMode;
  label: string;
  icon: string;
  desc: string;
}[] = [
  { id: "ear", label: "Ear", icon: "🎧", desc: "AirPods whisper suggestions" },
  { id: "eye", label: "Eye", icon: "👁", desc: "Screen only, silent" },
  {
    id: "text",
    label: "Text",
    icon: "⌨️",
    desc: "Type what they say (loud environments)",
  },
  {
    id: "auto",
    label: "Auto",
    icon: "🔄",
    desc: "Switches ear↔text based on noise",
  },
];

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Spanish", flag: "🇪🇸" },
  { code: "fr", label: "French", flag: "🇫🇷" },
  { code: "de", label: "German", flag: "🇩🇪" },
  { code: "pt", label: "Portuguese", flag: "🇧🇷" },
  { code: "it", label: "Italian", flag: "🇮🇹" },
  { code: "zh", label: "Chinese", flag: "🇨🇳" },
  { code: "ja", label: "Japanese", flag: "🇯🇵" },
];

const TONE_COLORS = {
  bold: {
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    text: "text-amber-300",
    ring: "ring-amber-500/50",
  },
  warm: {
    bg: "bg-rose-500/15",
    border: "border-rose-500/40",
    text: "text-rose-300",
    ring: "ring-rose-500/50",
  },
  safe: {
    bg: "bg-sky-500/15",
    border: "border-sky-500/40",
    text: "text-sky-300",
    ring: "ring-sky-500/50",
  },
};

const NOISE_COLORS = {
  quiet: {
    bar: "bg-emerald-500",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  moderate: {
    bar: "bg-yellow-500",
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  },
  loud: {
    bar: "bg-orange-500",
    badge: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  },
  concert: {
    bar: "bg-red-500",
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
  },
};

// ── Waveform Visualizer ────────────────────────────────────────────────────────
function WaveformBar({
  waveform,
  isActive,
}: {
  waveform: Uint8Array;
  isActive: boolean;
}) {
  const BAR_COUNT = 24;
  const step = Math.floor(waveform.length / BAR_COUNT);
  return (
    <div className="flex items-center justify-center gap-0.5 h-8">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const v = waveform[i * step] ?? 128;
        const height = isActive
          ? Math.max(4, (Math.abs(v - 128) / 128) * 100)
          : 4;
        return (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-75"
            style={{
              height: `${height}%`,
              minHeight: 4,
              background: isActive
                ? `hsl(${160 + i * 3}, 80%, 55%)`
                : "rgba(255,255,255,0.15)",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Suggestion Card ────────────────────────────────────────────────────────────
function SuggestionCard({
  suggestion,
  onClick,
  isSpeaking,
}: {
  suggestion: WingmanSuggestion;
  onClick: () => void;
  isSpeaking: boolean;
}) {
  const c = TONE_COLORS[suggestion.tone];
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-2xl border p-4 transition-all duration-200 group",
        "active:scale-[0.98] hover:scale-[1.01]",
        c.bg,
        c.border,
        isSpeaking ? `ring-2 ${c.ring}` : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{suggestion.emoji}</span>
          <span
            className={`text-xs font-bold uppercase tracking-widest ${c.text}`}
          >
            {suggestion.label}
          </span>
        </div>
        {isSpeaking && (
          <span className={`text-xs ${c.text} flex items-center gap-1`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse bg-current" />
            Speaking
          </span>
        )}
      </div>
      <p className="text-white/90 text-sm leading-relaxed">{suggestion.text}</p>
      <div
        className={`mt-2 text-xs ${c.text} opacity-0 group-hover:opacity-100 transition-opacity`}
      >
        Tap to speak →
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function WingmanPage() {
  const router = useRouter();

  // ── State ──
  const [cyranoMode, setCyranoMode] = useState<CyranoMode>("date");
  const [outputMode, setOutputMode] = useState<OutputMode>("auto");
  const [myLang, setMyLang] = useState("en");
  const [theirLang, setTheirLang] = useState("es");
  const [isRunning, setIsRunning] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [showSetup, setShowSetup] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [noiseActive, setNoiseActive] = useState(false);
  const [currentSpeakingId, setCurrentSpeakingId] = useState<string | null>(
    null,
  );
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // ── TTS hook ──
  const tts = useTTS({ language: myLang, enabled: ttsEnabled && isRunning });

  // ── Ambient noise ──
  const noise = useAmbientNoise({ enabled: noiseActive });
  const autoTextMode = outputMode === "auto" && noise.reading.autoTextMode;
  const effectiveMode = autoTextMode ? "text" : outputMode;

  // ── Wingman ──
  const wingman = useWingman({
    cyranoMode,
    outputMode: effectiveMode,
    myLanguage: myLang,
    theirLanguage: theirLang,
    autoTextModeActive: noise.reading.autoTextMode,
    onSpeak: (text) => {
      tts.speak(text);
    },
  });

  // ── Start / stop noise monitoring when session starts ──
  useEffect(() => {
    if (isRunning && outputMode === "auto" && !noise.isActive) {
      noise.start();
      setNoiseActive(true);
    }
    if (!isRunning && noise.isActive) {
      noise.stop();
      setNoiseActive(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, outputMode]);

  // ── Auto-scroll transcript ──
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [wingman.transcript]);

  // ── Handlers ──
  const handleStart = () => {
    setShowSetup(false);
    setIsRunning(true);
    wingman.start();
  };

  const handleStop = () => {
    setIsRunning(false);
    wingman.stop();
    tts.cancel();
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    wingman.addTheirText(textInput.trim());
    setTextInput("");
  };

  const handleSelectSuggestion = (s: WingmanSuggestion) => {
    setCurrentSpeakingId(s.id);
    wingman.selectSuggestion(s);
    setTimeout(() => setCurrentSpeakingId(null), 4000);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SETUP SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (showSetup) {
    return (
      <div className="min-h-screen bg-[#080808] text-white flex flex-col">
        {/* Ambient background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-indigo-600/[0.08] blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[5%] w-[400px] h-[400px] rounded-full bg-violet-600/[0.06] blur-[100px]" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col max-w-lg mx-auto w-full px-5 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <button
              onClick={() => router.back()}
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              ←
            </button>
            <div className="text-center">
              <div className="text-2xl mb-1">🎧</div>
              <h1 className="text-xl font-bold tracking-tight">Wingman Mode</h1>
              <p className="text-white/40 text-xs mt-0.5">
                AI in your ear, live
              </p>
            </div>
            <div className="w-6" />
          </div>

          {/* Situation Mode */}
          <section className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 block">
              What&apos;s the situation?
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {CYRANO_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setCyranoMode(m.id)}
                  className={[
                    "rounded-2xl border p-4 text-left transition-all duration-200",
                    cyranoMode === m.id
                      ? "bg-white/10 border-white/30"
                      : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="text-2xl mb-2">{m.emoji}</div>
                  <div className="font-semibold text-sm">{m.label}</div>
                  <div className="text-white/40 text-xs mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Output Mode */}
          <section className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 block">
              How should Wingman deliver?
            </label>
            <div className="flex flex-col gap-2">
              {OUTPUT_MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setOutputMode(m.id)}
                  className={[
                    "rounded-xl border p-3.5 flex items-center gap-3 transition-all",
                    outputMode === m.id
                      ? "bg-white/10 border-white/25"
                      : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.05]",
                  ].join(" ")}
                >
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <div className="text-left">
                    <div className="font-semibold text-sm">{m.label}</div>
                    <div className="text-white/40 text-xs">{m.desc}</div>
                  </div>
                  {outputMode === m.id && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Languages */}
          <section className="mb-8">
            <label className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3 block">
              Languages
            </label>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-xs text-white/40 mb-1.5">You speak</div>
                <select
                  value={myLang}
                  onChange={(e) => setMyLang(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/25"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <div className="text-xs text-white/40 mb-1.5">They speak</div>
                <select
                  value={theirLang}
                  onChange={(e) => setTheirLang(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/25"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.flag} {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* TTS toggle */}
          <section className="mb-10">
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={[
                "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                ttsEnabled
                  ? "bg-white/5 border-white/15"
                  : "bg-white/[0.02] border-white/[0.08]",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🔊</span>
                <div className="text-left">
                  <div className="text-sm font-medium">Voice in AirPods</div>
                  <div className="text-xs text-white/40">
                    Wingman speaks suggestions aloud
                  </div>
                </div>
              </div>
              <div
                className={[
                  "w-11 h-6 rounded-full transition-all relative",
                  ttsEnabled ? "bg-white/80" : "bg-white/15",
                ].join(" ")}
              >
                <div
                  className={[
                    "absolute top-1 w-4 h-4 rounded-full bg-black transition-all",
                    ttsEnabled ? "left-6" : "left-1",
                  ].join(" ")}
                />
              </div>
            </button>
          </section>

          {/* Start button */}
          <button
            onClick={handleStart}
            className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base tracking-tight hover:bg-white/90 active:bg-white/80 transition-all"
          >
            Activate Wingman
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIVE SESSION SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  const noiseColor = NOISE_COLORS[noise.reading.level];
  const activeModeMeta = CYRANO_MODES.find((m) => m.id === cyranoMode)!;

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 transition-all duration-1000"
          style={{
            background: wingman.isThinking
              ? "radial-gradient(ellipse at 50% 30%, rgba(139,92,246,0.12) 0%, transparent 60%)"
              : wingman.suggestions.length > 0
                ? "radial-gradient(ellipse at 50% 30%, rgba(16,185,129,0.08) 0%, transparent 60%)"
                : "radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.06) 0%, transparent 60%)",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col h-screen max-w-lg mx-auto w-full">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
          <button
            onClick={() => {
              handleStop();
              setShowSetup(true);
            }}
            className="text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            ← Setup
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg">{activeModeMeta.emoji}</span>
            <span className="font-semibold text-sm">
              {activeModeMeta.label}
            </span>
            <div
              className={[
                "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                isRunning
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
                  : "bg-white/5 text-white/40 border-white/10",
              ].join(" ")}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-400 animate-pulse" : "bg-white/30"}`}
              />
              {isRunning ? "Live" : "Paused"}
            </div>
          </div>

          <button
            onClick={isRunning ? handleStop : wingman.start}
            className="text-white/60 hover:text-white text-xs border border-white/15 rounded-lg px-3 py-1.5 transition-all"
          >
            {isRunning ? "Pause" : "Resume"}
          </button>
        </div>

        {/* ── Status strip ── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.04]">
          {/* Noise level */}
          {noise.isActive ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5 items-end h-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`w-1 rounded-sm transition-all ${n <= noise.reading.bars ? noiseColor.bar : "bg-white/10"}`}
                    style={{ height: `${n * 20}%` }}
                  />
                ))}
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${noiseColor.badge}`}
              >
                {noise.reading.label}
              </span>
              {noise.reading.autoTextMode && (
                <span className="text-xs text-orange-300 flex items-center gap-1">
                  ⌨️ Text mode
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-white/30 text-xs">
              <span>🎧</span>
              <span>
                {OUTPUT_MODES.find((m) => m.id === outputMode)?.label} mode
              </span>
            </div>
          )}

          {/* TTS status */}
          <div className="flex items-center gap-2">
            {tts.isSpeaking && (
              <div className="flex items-center gap-1 text-emerald-300 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Whispering
              </div>
            )}
            {wingman.isThinking && (
              <div className="flex items-center gap-1 text-violet-300 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Thinking…
              </div>
            )}
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ── Waveform / listening zone ── */}
          <div className="px-5 py-4 flex flex-col items-center gap-2">
            <WaveformBar
              waveform={noise.waveform}
              isActive={wingman.isListening}
            />
            <div className="text-xs text-white/30">
              {wingman.isListening && effectiveMode !== "text"
                ? `Listening for ${LANGUAGES.find((l) => l.code === theirLang)?.flag} …`
                : effectiveMode === "text"
                  ? "Type what they say below"
                  : "Press Activate to start"}
            </div>
          </div>

          {/* ── Last heard ── */}
          {wingman.lastTheirText && (
            <div className="mx-5 mb-3 px-4 py-3 bg-white/[0.04] rounded-xl border border-white/[0.08]">
              <div className="text-xs text-white/35 mb-1 uppercase tracking-wider">
                They said
              </div>
              <p className="text-sm text-white/80 italic">
                &quot;{wingman.lastTheirText}&quot;
              </p>
            </div>
          )}

          {/* ── Suggestions ── */}
          {wingman.suggestions.length > 0 ? (
            <div className="px-5 flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/35 uppercase tracking-widest">
                  Suggestions
                </span>
                <button
                  onClick={wingman.dismissSuggestions}
                  className="text-xs text-white/20 hover:text-white/50 transition-colors"
                >
                  dismiss
                </button>
              </div>
              {wingman.suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onClick={() => handleSelectSuggestion(s)}
                  isSpeaking={currentSpeakingId === s.id}
                />
              ))}
            </div>
          ) : wingman.isThinking ? (
            <div className="mx-5 mb-4 px-4 py-6 flex items-center justify-center gap-3 bg-violet-500/[0.08] rounded-2xl border border-violet-500/20">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
              <span className="text-violet-300 text-sm">
                Finding what to say…
              </span>
            </div>
          ) : null}

          {/* ── Transcript ── */}
          <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
            {wingman.transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
                <div className="text-4xl opacity-30">🎧</div>
                <div className="text-white/25 text-sm max-w-[220px]">
                  {effectiveMode === "text"
                    ? "Type what they say. Wingman gives you the perfect response."
                    : `Wingman is listening for ${LANGUAGES.find((l) => l.code === theirLang)?.label}. Start the conversation.`}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 py-2">
                {wingman.transcript.map((line, i) => (
                  <div
                    key={i}
                    className={`flex ${line.speaker === "you" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                        line.speaker === "you"
                          ? "bg-white/10 text-white"
                          : "bg-white/[0.05] text-white/75",
                      ].join(" ")}
                    >
                      <div className="text-xs text-white/30 mb-0.5">
                        {line.speaker === "you" ? "You" : "Them"}
                      </div>
                      {line.text}
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom input (text mode / loud environment) ── */}
        <div className="px-5 pb-6 pt-3 border-t border-white/[0.06]">
          {effectiveMode === "text" || noise.reading.autoTextMode ? (
            <div>
              <div className="text-xs text-white/30 mb-2 flex items-center gap-1.5">
                {noise.reading.autoTextMode && (
                  <span className="text-orange-300">🔇 Too loud for mic —</span>
                )}
                Type what they said
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
                  placeholder="What did they say?"
                  className="flex-1 bg-white/[0.06] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-white/25 transition-colors"
                  autoFocus
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="bg-white text-black font-bold px-4 rounded-xl text-sm disabled:opacity-30 transition-all active:scale-95"
                >
                  →
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              {/* Noise monitor toggle */}
              <button
                onClick={() => {
                  if (noise.isActive) {
                    noise.stop();
                    setNoiseActive(false);
                  } else {
                    noise.start();
                    setNoiseActive(true);
                  }
                }}
                className={[
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                  noise.isActive
                    ? "bg-white/[0.08] border-white/20 text-white"
                    : "bg-white/[0.03] border-white/[0.08] text-white/40",
                ].join(" ")}
              >
                🔊{" "}
                <span>
                  {noise.isActive ? `${noise.reading.db} dB` : "Noise Monitor"}
                </span>
              </button>

              {/* TTS toggle */}
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={[
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",
                  ttsEnabled
                    ? "bg-white/[0.08] border-white/20 text-white"
                    : "bg-white/[0.03] border-white/[0.08] text-white/40",
                ].join(" ")}
              >
                🎧 <span>{ttsEnabled ? "AirPods On" : "AirPods Off"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
