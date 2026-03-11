"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  PeerConnection,
  getCamera,
  stopCamera,
  type IceConnectionState,
  type ConnectionQuality,
} from "../../lib/peer-connection";
import { getSpeechCode, getFlag, getLanguage } from "../../lib/languages";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionInstance,
  CaptionData,
} from "../../lib/speech-types";
import PreCallLobby from "../../components/PreCallLobby";
import {
  BrowserUnsupportedScreen,
  PermissionDeniedScreen,
  ConnectionFailedScreen,
  RoomFullScreen,
  detectErrorType,
} from "../../components/ErrorScreens";
import ReconnectingOverlay from "../../components/ReconnectingOverlay";
import { useBrowserSupport } from "../../lib/browser-support";
import {
  useCyrano,
  type CyranoMode,
  type Suggestion,
  type UseCyranoReturn,
} from "../../lib/useCyrano";
import { useTranscription } from "@/hooks/useTranscription";

// Text-to-Speech helper
const speakText = (text: string, lang: string) => {
  if (!text.trim() || typeof window === "undefined") return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechCode(lang);
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
};

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CALL - PeerJS P2P with Live Translation
// Mobile-optimized, no external API dependencies
// ═══════════════════════════════════════════════════════════════════════════════

type CallStatus =
  | "loading"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "room_full";

interface TranscriptEntry {
  id: string;
  speaker: "me" | "partner";
  name: string;
  original: string;
  translated: string;
  timestamp: Date;
  lang: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CYRANO PANEL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const CYRANO_MODES: {
  id: CyranoMode;
  label: string;
  emoji: string;
  color: string;
  description: string;
  shortDesc: string;
}[] = [
  {
    id: "date",
    label: "Date",
    emoji: "🔥",
    color: "#f97316",
    description:
      "Romantic conversations. Get playful, warm, or safe suggestions to build connection.",
    shortDesc: "Build romantic connection",
  },
  {
    id: "interview",
    label: "Interview",
    emoji: "💼",
    color: "#3b82f6",
    description:
      "Job interviews. Memorable answers that make you stand out to interviewers.",
    shortDesc: "Ace your interviews",
  },
  {
    id: "hardtalk",
    label: "Hard Talk",
    emoji: "⚖️",
    color: "#8b5cf6",
    description:
      "Difficult conversations. De-escalate conflicts with clarity and empathy.",
    shortDesc: "Navigate tough talks",
  },
  {
    id: "sales",
    label: "Sales",
    emoji: "🎯",
    color: "#10b981",
    description:
      "Sales calls. Handle objections and move conversations forward.",
    shortDesc: "Close more deals",
  },
];

const TONE_COLORS: Record<string, string> = {
  bold: "#f59e0b",
  warm: "#ec4899",
  safe: "#64748b",
};

function CyranoPanel({
  cyrano,
  onSuggestionPick,
  onClose,
}: {
  cyrano: UseCyranoReturn;
  onSuggestionPick: (text: string) => void;
  onClose: () => void;
}) {
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
    regenerateSuggestions,
  } = cyrano;

  const [manualInput, setManualInput] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const activeMode = CYRANO_MODES.find((m) => m.id === currentMode)!;

  const submitManual = () => {
    if (!manualInput.trim()) return;
    addTheirLine(manualInput.trim());
    setManualInput("");
  };

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden h-full max-h-[70vh] md:max-h-full"
      style={{
        background: "rgba(6, 6, 10, 0.95)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow:
          "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: `linear-gradient(90deg, ${activeMode.color}18 0%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative w-2 h-2">
            <div
              className={`w-2 h-2 rounded-full ${isListening ? "bg-green-400" : isActive ? "bg-amber-400" : "bg-zinc-600"}`}
            />
            {isListening && (
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-400 animate-ping opacity-60" />
            )}
          </div>
          <span
            className="text-xs font-black tracking-[0.15em] uppercase"
            style={{ color: activeMode.color }}
          >
            Cyrano
          </span>
          {isActive && (
            <span className="text-xs text-white/30 font-medium">
              {activeMode.emoji} {activeMode.label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
        >
          ✕
        </button>
      </div>

      {/* Setup (not active) - ONBOARDING */}
      {!isActive && (
        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          {/* First-time onboarding banner */}
          {showOnboarding && (
            <div
              className="p-3 rounded-xl relative"
              style={{
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <button
                onClick={() => setShowOnboarding(false)}
                className="absolute top-2 right-2 text-amber-400/50 hover:text-amber-400 text-xs"
              >
                ✕
              </button>
              <p className="text-amber-200 text-xs leading-relaxed pr-4">
                <strong>How Cyrano works:</strong> After your partner speaks,
                you&apos;ll get 3 suggestions:
              </p>
              <div className="flex gap-2 mt-2 text-[10px]">
                <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300">
                  ⚡ Bold
                </span>
                <span className="px-2 py-1 rounded bg-pink-500/20 text-pink-300">
                  💛 Warm
                </span>
                <span className="px-2 py-1 rounded bg-slate-500/20 text-slate-300">
                  🛡️ Safe
                </span>
              </div>
              <p className="text-amber-200/60 text-[10px] mt-2">
                Tap any suggestion to copy it, then say it naturally.
              </p>
            </div>
          )}

          <p className="text-white/40 text-xs text-center tracking-wide">
            Choose a mode for your conversation
          </p>

          {/* Mode cards with descriptions */}
          <div className="grid grid-cols-1 gap-2">
            {CYRANO_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setMode(mode.id)}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left min-h-[56px]"
                style={{
                  borderColor:
                    currentMode === mode.id
                      ? `${mode.color}55`
                      : "rgba(255,255,255,0.06)",
                  background:
                    currentMode === mode.id
                      ? `${mode.color}14`
                      : "rgba(255,255,255,0.02)",
                  boxShadow:
                    currentMode === mode.id
                      ? `0 0 16px ${mode.color}18`
                      : "none",
                }}
              >
                <span className="text-2xl shrink-0">{mode.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-sm font-semibold block"
                    style={{
                      color:
                        currentMode === mode.id
                          ? mode.color
                          : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {mode.label}
                  </span>
                  <span className="text-[11px] text-white/30 block truncate">
                    {mode.shortDesc}
                  </span>
                </div>
                {currentMode === mode.id && (
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: mode.color }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Selected mode description */}
          <p className="text-white/25 text-[11px] text-center leading-relaxed px-2">
            {activeMode.description}
          </p>

          <button
            onClick={activate}
            className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98] min-h-[48px]"
            style={{
              background: `linear-gradient(135deg, ${activeMode.color} 0%, ${activeMode.color}cc 100%)`,
              color: "#000",
              boxShadow: `0 4px 24px ${activeMode.color}40`,
            }}
          >
            Activate {activeMode.label} {activeMode.emoji}
          </button>
        </div>
      )}

      {/* Active state */}
      {isActive && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mode tabs */}
          <div
            className="flex px-3 pt-3 gap-1 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            {CYRANO_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setMode(mode.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs transition-all duration-200 mb-2"
                style={{
                  background:
                    currentMode === mode.id ? `${mode.color}20` : "transparent",
                  color:
                    currentMode === mode.id
                      ? mode.color
                      : "rgba(255,255,255,0.22)",
                  fontWeight: currentMode === mode.id ? 700 : 400,
                }}
              >
                <span>{mode.emoji}</span>
                <span className="tracking-wide">{mode.label}</span>
              </button>
            ))}
          </div>

          {/* Live caption */}
          {liveCaption && (
            <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] shrink-0">
              <span className="text-white/40 text-xs italic">
                🎤 {liveCaption}
              </span>
            </div>
          )}

          {/* Manual input */}
          <div
            className="px-3 pt-3 pb-0 shrink-0"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="flex gap-2 pb-3">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitManual()}
                placeholder="Type what they said..."
                className="flex-1 bg-white/[0.05] border border-white/[0.09] rounded-lg px-3 py-2 text-white/80 text-xs placeholder:text-white/20 outline-none focus:border-amber-400/40 focus:bg-white/[0.07] transition-all"
              />
              <button
                onClick={submitManual}
                disabled={!manualInput.trim()}
                className="px-3 py-2 bg-amber-400 disabled:bg-white/10 rounded-lg text-black disabled:text-white/25 text-xs font-bold transition-all hover:bg-amber-300 disabled:cursor-not-allowed"
              >
                →
              </button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
            {isThinking && (
              <div className="flex items-center gap-3 py-2 px-1">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
                <span className="text-white/30 text-xs tracking-wide">
                  Thinking...
                </span>
              </div>
            )}

            {!isThinking && suggestions.length === 0 && !liveCaption && (
              <div className="flex flex-col items-center justify-center py-5 gap-2">
                <span className="text-2xl opacity-20">{activeMode.emoji}</span>
                <p className="text-white/20 text-xs text-center max-w-[200px] leading-relaxed">
                  Suggestions appear after they speak. Cyrano is listening.
                </p>
              </div>
            )}

            {!isThinking &&
              suggestions.map((s, i) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  index={i}
                  onSelect={(text) => {
                    onSuggestionPick(text);
                    dismissSuggestions();
                  }}
                />
              ))}

            {/* Suggestion actions */}
            {suggestions.length > 0 && !isThinking && (
              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  onClick={() => regenerateSuggestions()}
                  className="flex items-center gap-1.5 text-amber-400/60 text-[11px] hover:text-amber-400 transition-colors min-h-[36px] px-2"
                  title="Get new suggestions"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  regenerate
                </button>
                <button
                  onClick={dismissSuggestions}
                  className="text-white/20 text-[11px] hover:text-white/40 transition-colors min-h-[36px] px-2"
                >
                  dismiss
                </button>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isListening ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`}
              />
              <span className="text-white/30 text-xs">
                {isListening ? "Listening" : "Mic off"}
              </span>
            </div>
            <div className="flex gap-2">
              {transcript.length > 0 && (
                <button
                  onClick={clearTranscript}
                  className="text-white/25 text-xs hover:text-white/50 transition-colors min-h-[44px] px-3"
                >
                  clear
                </button>
              )}
              <button
                onClick={deactivate}
                className="text-red-400/60 text-xs font-medium hover:text-red-400 transition-colors min-h-[44px] px-3"
              >
                stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

  return (
    <div
      onClick={() => {
        navigator.clipboard.writeText(suggestion.text).catch(() => {});
        onSelect(suggestion.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{ borderLeft: `3px solid ${color}` }}
      className="group relative bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl p-3.5 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:border-white/[0.16] active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{suggestion.emoji}</span>
          <span
            className="text-[10px] font-black tracking-[0.15em] uppercase"
            style={{ color }}
          >
            {suggestion.label}
          </span>
        </div>
        <span
          className="text-[10px] transition-all"
          style={{ color: copied ? "#10b981" : "rgba(255,255,255,0.2)" }}
        >
          {copied ? "✓ copied" : "tap"}
        </span>
      </div>
      <p className="text-white/85 text-xs leading-relaxed font-light">
        {suggestion.text}
      </p>
    </div>
  );
}

function VideoCallContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Browser support detection
  const browserSupport = useBrowserSupport();

  const roomCode = params.id as string;
  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") || "User";
  const initialUserLang = searchParams.get("lang") || "en";

  // Reconnection state
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  // Lobby state - start in lobby mode
  const [inLobby, setInLobby] = useState(true);
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);

  // Language state (can be changed in lobby)
  const [userLang, setUserLang] = useState(initialUserLang);
  // Partner's language - can be set in lobby OR auto-detected during call
  const [partnerLang, setPartnerLang] = useState<string | null>(null);
  const [expectedPartnerLang, setExpectedPartnerLang] = useState<string>(
    initialUserLang === "en" ? "es" : "en",
  );

  // State
  const [status, setStatus] = useState<CallStatus>("loading");
  const [statusMessage, setStatusMessage] = useState("Iniciando...");
  const [error, setError] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(false);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [partnerName, setPartnerName] = useState("");

  // Media state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Translation state
  const [isListening, setIsListening] = useState(false);
  const [myLiveText, setMyLiveText] = useState("");
  const [myLiveTranslation, setMyLiveTranslation] = useState("");
  const [theirLiveText, setTheirLiveText] = useState("");
  const [theirLiveTranslation, setTheirLiveTranslation] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium",
  );

  // UI state
  const [copied, setCopied] = useState(false);
  const [iceState, setIceState] = useState<IceConnectionState | null>(null);

  // Cyrano Mode state
  const [cyranoOpen, setCyranoOpen] = useState(false);
  const [cyranoPhrase, setCyranoPhrase] = useState("");
  const cyrano = useCyrano({ initialMode: "date", userLanguage: userLang });
  const cyranoEnabledOnJoinRef = useRef(false);

  // Refs (need to be defined before useTranscription hook)
  const peerRef = useRef<PeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // WebRTC sendMessage wrapper for useTranscription hook
  const sendWebRTCMessage = useCallback((message: string): boolean => {
    if (!peerRef.current) return false;
    try {
      // Parse and send as object (PeerConnection expects objects)
      const parsed = JSON.parse(message);
      peerRef.current.send(parsed);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Transcription hook - handles STT + translation + broadcasting
  // Supports Web Speech API (Chrome/Edge) + Whisper fallback (Safari/Firefox)
  const transcription = useTranscription({
    myLanguage: userLang,
    theirLanguage: partnerLang || expectedPartnerLang,
    localStream: lobbyStream || localStreamRef.current,
    sendMessage: sendWebRTCMessage,
    isActive: status === "connected" && hasPartner && !inLobby,
  });

  // Sync transcription hook output to UI state
  useEffect(() => {
    if (transcription.localCaption || transcription.localFinal) {
      setMyLiveText(transcription.localCaption || transcription.localFinal);
    }
    if (transcription.localTranslated) {
      setMyLiveTranslation(transcription.localTranslated);
    }
    setIsListening(transcription.isListening);
    if (transcription.error) {
      console.warn("[Transcription]", transcription.error);
    }
  }, [
    transcription.localCaption,
    transcription.localFinal,
    transcription.localTranslated,
    transcription.isListening,
    transcription.error,
  ]);

  // Quality monitoring state
  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callStartTimeRef = useRef<number | null>(null);

  // Refs (peerRef, localStreamRef defined above for useTranscription)
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  const mountedRef = useRef(true);
  const captionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const theirCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interimTranslateRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranslatedTextRef = useRef<string>("");

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Ref for auto-start tracking (defined early, used after startListening is defined)
  const hasAutoStartedRef = useRef(false);

  // Enable controls when connected - either hasPartner OR we have remote video stream
  const isConnected = status === "connected" && (hasPartner || hasRemoteStream);
  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "error" || status === "room_full"
        ? "bg-red-500"
        : "bg-yellow-500";

  // Format call duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Quality bar colors
  const getQualityBars = (
    q: ConnectionQuality | null,
  ): { count: number; color: string } => {
    if (!q) return { count: 0, color: "bg-gray-500" };
    switch (q.quality) {
      case "excellent":
        return { count: 4, color: "bg-green-400" };
      case "good":
        return { count: 3, color: "bg-green-400" };
      case "fair":
        return { count: 2, color: "bg-yellow-400" };
      case "poor":
        return { count: 1, color: "bg-red-400" };
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY HANDLER - Join call with pre-configured stream
  // ═══════════════════════════════════════════════════════════════════════════

  const handleLobbyJoin = useCallback(
    (settings: {
      stream: MediaStream;
      userLang: string;
      partnerLang: string;
      videoEnabled: boolean;
      cyranoEnabled: boolean;
    }) => {
      setLobbyStream(settings.stream);
      setUserLang(settings.userLang);
      setExpectedPartnerLang(settings.partnerLang);
      setIsVideoOff(!settings.videoEnabled);
      // Store cyrano preference in ref - activation handled by useEffect
      cyranoEnabledOnJoinRef.current = settings.cyranoEnabled;
      setInLobby(false);
    },
    [],
  );

  // Activate Cyrano after leaving lobby if it was enabled
  useEffect(() => {
    if (!inLobby && cyranoEnabledOnJoinRef.current) {
      cyrano.activate();
      cyranoEnabledOnJoinRef.current = false; // Reset to prevent re-activation
    }
  }, [inLobby, cyrano]);

  const handleLobbyBack = useCallback(() => {
    router.push("/");
  }, [router]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CALL DURATION TIMER
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;

    if (hasPartner && status === "connected") {
      // Start timer when partner joins
      if (!callStartTimeRef.current) {
        callStartTimeRef.current = Date.now();
      }

      timerInterval = setInterval(() => {
        if (callStartTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - callStartTimeRef.current) / 1000,
          );
          setCallDuration(elapsed);
        }
      }, 1000);
    } else if (!hasPartner) {
      // Reset when partner leaves
      callStartTimeRef.current = null;
      setCallDuration(0);
    }

    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [hasPartner, status]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PEERJS SETUP - Only runs after leaving lobby
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Don't initialize until we leave the lobby
    if (inLobby) return;

    mountedRef.current = true;
    let localStream: MediaStream | null = lobbyStream;

    const init = async () => {
      try {
        setStatus("loading");

        // Use stream from lobby if available AND tracks are active
        // If stream exists but tracks are stopped, get a new one
        const isStreamActive = (stream: MediaStream | null): boolean => {
          if (!stream) return false;
          const tracks = stream.getTracks();
          return (
            tracks.length > 0 && tracks.some((t) => t.readyState === "live")
          );
        };

        if (!localStream || !isStreamActive(localStream)) {
          setStatusMessage("Getting camera...");
          localStream = await getCamera("user");
        }

        localStreamRef.current = localStream;

        // Show local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setStatusMessage(isHost ? "Creating room..." : "Joining room...");

        // Create PeerJS connection
        const peer = new PeerConnection({
          onStatusChange: (peerStatus, message) => {
            if (!mountedRef.current) return;
            console.log("📞 Status:", peerStatus, message);

            if (peerStatus === "waiting") {
              setStatus("waiting");
              setStatusMessage("Waiting for partner...");
            } else if (peerStatus === "connecting") {
              setStatus("connecting");
              setStatusMessage(message || "Connecting...");
            } else if (peerStatus === "connected") {
              setStatus("connected");
              setStatusMessage("Connected!");
            } else if (peerStatus === "room_full") {
              setStatus("room_full");
              setError(
                message || "This room is full. Only 2 participants allowed.",
              );
            } else if (peerStatus === "failed") {
              setStatus("error");
              setError(message || "Connection failed");
            }
          },
          onRemoteStream: (stream) => {
            if (!mountedRef.current) return;
            console.log("📺 Got remote stream!");
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
            // Mark that we have a remote stream - enables mic even if hello wasn't received
            setHasRemoteStream(true);
            setHasPartner(true); // If we got video, partner is definitely connected
          },
          onDataMessage: (data: unknown) => {
            if (!mountedRef.current) return;
            handleDataMessage(data as CaptionData | Record<string, unknown>);
          },
          onPartnerJoined: (name) => {
            if (!mountedRef.current) return;
            console.log("👋 Partner joined:", name);
            setPartnerName(name);
            setHasPartner(true);
          },
          onPartnerLeft: () => {
            if (!mountedRef.current) return;
            console.log("👋 Partner left");
            setHasPartner(false);
            setHasRemoteStream(false);
            setPartnerName("");
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            console.error("❌ Error:", err);
            setError(err);
            setStatus("error");
          },
          onIceStateChange: (state) => {
            if (!mountedRef.current) return;
            console.log("🧊 ICE state:", state);
            setIceState(state);
          },
          onQualityUpdate: (qualityData) => {
            if (!mountedRef.current) return;
            setQuality(qualityData);
          },
        });

        peerRef.current = peer;

        // Connect
        const success = await peer.connect(
          roomCode,
          isHost,
          userName,
          "video",
          localStream,
        );

        if (!success && mountedRef.current) {
          setStatus("error");
          setError("Failed to connect");
        }
      } catch (err: unknown) {
        console.error("Init error:", err);
        if (mountedRef.current) {
          setStatus("error");
          const errorMessage =
            err instanceof Error ? err.message : "Failed to start call";
          setError(errorMessage);
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      stopListening();
      // Disconnect peer FIRST to prevent "track already stopped" errors
      if (peerRef.current) {
        peerRef.current.disconnect();
      }
      // Wait for disconnect to complete before stopping tracks
      setTimeout(() => {
        if (localStreamRef.current) {
          stopCamera(localStreamRef.current);
        }
      }, 100);
    };
  }, [roomCode, isHost, userName, inLobby, lobbyStream]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA MESSAGE HANDLING (captions from partner)
  // Supports both legacy "caption" type and new "translation"/"transcription" types
  // ═══════════════════════════════════════════════════════════════════════════

  // Type for new translation messages from useTranscription hook
  interface TranslationMessage {
    type: "translation";
    text: string;
    original: string;
    from: string;
    to: string;
  }

  // Type for new transcription messages from useTranscription hook
  interface TranscriptionMessage {
    type: "transcription";
    text: string;
    lang: string;
  }

  // Type guard for CaptionData (legacy format)
  const isCaptionData = (data: unknown): data is CaptionData => {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      (data as Record<string, unknown>).type === "caption" &&
      "text" in data &&
      typeof (data as Record<string, unknown>).text === "string"
    );
  };

  // Type guard for new translation messages
  const isTranslationMessage = (data: unknown): data is TranslationMessage => {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      (data as Record<string, unknown>).type === "translation" &&
      "text" in data
    );
  };

  // Type guard for new transcription messages
  const isTranscriptionMessage = (
    data: unknown,
  ): data is TranscriptionMessage => {
    return (
      typeof data === "object" &&
      data !== null &&
      "type" in data &&
      (data as Record<string, unknown>).type === "transcription" &&
      "text" in data
    );
  };

  const handleDataMessage = useCallback(
    async (
      data:
        | CaptionData
        | TranslationMessage
        | TranscriptionMessage
        | Record<string, unknown>,
    ) => {
      // Parse JSON string if needed (from useTranscription sendMessage)
      let parsed = data;
      if (typeof data === "string") {
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }
      }

      // Clear existing timeout
      if (theirCaptionTimeoutRef.current) {
        clearTimeout(theirCaptionTimeoutRef.current);
      }

      // Handle NEW translation message format (from useTranscription hook)
      if (isTranslationMessage(parsed)) {
        const { text, original, from } = parsed;

        // Track partner's language
        if (from) setPartnerLang(from);

        // Show original text and pre-translated text
        setTheirLiveText(original || text);
        setTheirLiveTranslation(text);

        // Speak the translation
        speakText(text, userLang);

        // Add to transcript
        addToTranscript(
          "partner",
          partnerName || "Partner",
          original || text,
          text,
          from || "en",
        );

        // Feed to Cyrano
        if (cyrano.isActive && original) {
          cyrano.addTheirLine(original);
        }

        // Auto-clear after 5 seconds
        theirCaptionTimeoutRef.current = setTimeout(() => {
          setTheirLiveText("");
          setTheirLiveTranslation("");
        }, 5000);
        return;
      }

      // Handle NEW transcription message format (raw speech, for Cyrano)
      if (isTranscriptionMessage(parsed)) {
        const { text, lang } = parsed;

        // Track partner's language
        if (lang) setPartnerLang(lang);

        // Show interim text (will be replaced by translation message)
        setTheirLiveText(text);

        // Auto-clear after 5 seconds
        theirCaptionTimeoutRef.current = setTimeout(() => {
          setTheirLiveText("");
          setTheirLiveTranslation("");
        }, 5000);
        return;
      }

      // Handle LEGACY caption format
      if (!isCaptionData(parsed)) {
        // Ignore non-caption messages (ping/pong, hello, etc.)
        return;
      }
      const captionData = parsed;

      // Track partner's language for UI display
      if (captionData.lang) {
        setPartnerLang(captionData.lang);
      }

      // Show partner's original text immediately
      setTheirLiveText(captionData.text);

      // SPEED: If partner already sent translation, use it instantly
      if (captionData.translation) {
        setTheirLiveTranslation(captionData.translation);
        if (captionData.isFinal) {
          speakText(captionData.translation, userLang);
        }
      } else {
        // Translate partner's text to OUR language
        const needsTranslation = captionData.lang !== userLang;
        if (needsTranslation && captionData.text) {
          try {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: captionData.text,
                sourceLang: captionData.lang,
                targetLang: userLang,
              }),
            });
            const result = await res.json();
            const translation =
              result.translation || result.translated || captionData.text;
            setTheirLiveTranslation(translation);
            if (captionData.isFinal) {
              speakText(translation, userLang);
            }
          } catch (err) {
            console.error("Translation failed:", err);
            setTheirLiveTranslation(`[${captionData.text}]`);
          }
        } else {
          // Same language, no translation needed
          setTheirLiveTranslation(captionData.text);
          if (captionData.isFinal) {
            speakText(captionData.text, userLang);
          }
        }
      }

      // Auto-clear after 5 seconds of no updates
      theirCaptionTimeoutRef.current = setTimeout(() => {
        setTheirLiveText("");
        setTheirLiveTranslation("");
      }, 5000);

      // If this is a final caption, add to transcript and feed to Cyrano
      if (captionData.isFinal && captionData.text) {
        addToTranscript(
          "partner",
          partnerName || "Partner",
          captionData.text,
          captionData.translation || captionData.text,
          captionData.lang || "en",
        );

        // Feed partner's speech to Cyrano for suggestion generation
        if (cyrano.isActive) {
          cyrano.addTheirLine(captionData.text);
        }
      }
    },
    [partnerName, userLang, cyrano],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION & TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  const translateText = async (
    text: string,
    toLang?: string,
  ): Promise<string> => {
    // Use detected partner language, or expected partner language from lobby
    const targetLanguage = toLang || partnerLang || expectedPartnerLang;
    if (userLang === targetLanguage) return text; // Same language, no translation needed
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceLang: userLang,
          targetLang: targetLanguage,
        }),
      });
      if (!res.ok) {
        console.error("Translation API error:", res.status);
        return text;
      }
      const data = await res.json();
      return data.translation || text;
    } catch (err) {
      console.error("Translation failed:", err);
      return text;
    }
  };

  const startListening = useCallback(() => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognitionAPI =
      window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition not supported");
      return;
    }
    const recognition = new SpeechRecognitionAPI();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechCode(userLang);

    recognition.onstart = () => {
      setIsListening(true);
      console.log("🎤 Listening started");
    };

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const results = event.results;
      const latest = results[results.length - 1];
      const text = latest[0].transcript.trim();
      const isFinal = latest.isFinal;

      // Update live text immediately
      setMyLiveText(text);

      // Send to partner immediately (they see live typing)
      peerRef.current?.send({
        type: "caption",
        text,
        isFinal,
        lang: userLang,
      });

      if (isFinal) {
        // Clear any pending interim translation
        if (interimTranslateRef.current) {
          clearTimeout(interimTranslateRef.current);
        }

        // Translate final result immediately
        const translation = await translateText(text);
        setMyLiveTranslation(translation);
        lastTranslatedTextRef.current = text;

        // Send final with translation
        peerRef.current?.send({
          type: "caption",
          text,
          translation,
          isFinal: true,
          lang: userLang,
        });

        // Add to transcript
        addToTranscript("me", userName, text, translation, userLang);

        // Clear after delay
        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
        captionTimeoutRef.current = setTimeout(() => {
          setMyLiveText("");
          setMyLiveTranslation("");
          lastTranslatedTextRef.current = "";
        }, 2000);
      } else {
        // SPEED OPTIMIZATION: Debounced translation for interim results
        // Translate while speaking, not just at the end
        if (interimTranslateRef.current) {
          clearTimeout(interimTranslateRef.current);
        }

        // Only translate if text is different and long enough
        if (text.length >= 3 && text !== lastTranslatedTextRef.current) {
          interimTranslateRef.current = setTimeout(async () => {
            // Double-check we're still on this text
            if (text === lastTranslatedTextRef.current) return;

            const translation = await translateText(text);
            setMyLiveTranslation(translation);
            lastTranslatedTextRef.current = text;

            // Send interim translation to partner
            peerRef.current?.send({
              type: "caption",
              text,
              translation,
              isFinal: false,
              lang: userLang,
            });
          }, 300); // 300ms debounce - fast but not overwhelming
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech error:", event.error);
      if (event.error !== "no-speech") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Restart if still listening
      if (isListeningRef.current && mountedRef.current) {
        try {
          recognition.start();
        } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [userLang, userName, partnerLang, expectedPartnerLang]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setMyLiveText("");
    setMyLiveTranslation("");
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-START SPEECH RECOGNITION
  // When call connects AND partner joins, automatically start listening
  // This enables bilateral real-time translation without manual activation
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Auto-start conditions: connected + partner present + not already listening + not already auto-started
    const shouldAutoStart =
      status === "connected" &&
      hasPartner &&
      !isListening &&
      !hasAutoStartedRef.current;

    if (shouldAutoStart) {
      console.log(
        "🎤 Auto-starting speech recognition - call connected with partner",
      );
      hasAutoStartedRef.current = true;
      // Small delay to ensure connection is fully stable
      const timeout = setTimeout(() => {
        if (mountedRef.current && !isListeningRef.current) {
          startListening();
        }
      }, 500);
      return () => clearTimeout(timeout);
    }

    // Reset auto-start flag if partner disconnects (allows re-auto-start if they rejoin)
    if (!hasPartner) {
      hasAutoStartedRef.current = false;
    }
  }, [status, hasPartner, isListening, startListening]);

  const addToTranscript = (
    speaker: "me" | "partner",
    name: string,
    original: string,
    translated: string,
    lang: string,
  ) => {
    const entry: TranscriptEntry = {
      id: Date.now().toString(),
      speaker,
      name,
      original,
      translated,
      timestamp: new Date(),
      lang,
    };
    setTranscript((prev) => [...prev, entry]);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const endCall = () => {
    stopListening();
    cyrano.deactivate();
    setCyranoOpen(false);
    setCyranoPhrase("");
    if (localStreamRef.current) {
      stopCamera(localStreamRef.current);
    }
    if (peerRef.current) {
      peerRef.current.disconnect();
    }
    router.push("/");
  };

  const copyLink = () => {
    // Default to different language for joining guest
    const guestLang = userLang === "en" ? "es" : "en";
    const url = `${window.location.origin}/call/${roomCode}?host=false&name=Guest&lang=${guestLang}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const retry = () => {
    window.location.reload();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // Show lobby first
  // Browser unsupported check
  if (!browserSupport.isSupported) {
    return (
      <BrowserUnsupportedScreen
        missingFeatures={browserSupport.missingFeatures}
      />
    );
  }

  // Reconnecting overlay
  if (isReconnecting && status === "reconnecting") {
    return (
      <ReconnectingOverlay
        attempt={reconnectAttempt}
        maxAttempts={maxReconnectAttempts}
        nextRetryIn={reconnectCountdown}
        onCancel={() => {
          setIsReconnecting(false);
          router.push("/");
        }}
      />
    );
  }

  if (inLobby) {
    return (
      <PreCallLobby
        roomCode={roomCode}
        userName={userName}
        userLang={userLang}
        isHost={isHost}
        onJoin={handleLobbyJoin}
        onBack={handleLobbyBack}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Video Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Remote Video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Cyrano Teleprompter Bar */}
        {cyranoPhrase && (
          <div
            className="absolute top-4 left-4 right-4 z-30 flex items-start gap-3 px-4 py-3 rounded-2xl cyrano-slide-down"
            style={{
              background: "rgba(6,6,10,0.92)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(245,158,11,0.3)",
              boxShadow:
                "0 0 32px rgba(245,158,11,0.1), 0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <span className="text-amber-400 text-sm mt-0.5 shrink-0">🎭</span>
            <p className="text-white/90 text-sm leading-relaxed flex-1">
              {cyranoPhrase}
            </p>
            <button
              onClick={() => setCyranoPhrase("")}
              className="text-white/25 hover:text-white/60 transition-colors text-lg leading-none shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>
        )}

        {/* No partner overlay */}
        {!hasPartner && (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
            <div className="text-center p-6">
              {status === "room_full" ? (
                <RoomFullScreen onBack={() => router.push("/")} />
              ) : status === "error" ? (
                (() => {
                  const errorType = detectErrorType(error || "Unknown error");
                  if (errorType === "permission_denied") {
                    return (
                      <PermissionDeniedScreen
                        permissionType="both"
                        onRetry={retry}
                        onBack={() => router.push("/")}
                      />
                    );
                  }
                  return (
                    <ConnectionFailedScreen
                      message={error || "Connection failed"}
                      onRetry={retry}
                      onBack={() => router.push("/")}
                    />
                  );
                })()
              ) : (
                <>
                  <div className="w-16 h-16 md:w-20 md:h-20 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                  <p className="text-white text-lg md:text-xl mb-2">
                    {statusMessage}
                  </p>
                  {isHost &&
                    (status === "waiting" || status === "connected") && (
                      <div className="mt-4 p-4 bg-white/10 backdrop-blur">
                        <p className="text-gray-400 text-sm mb-2">
                          Share this code:
                        </p>
                        <p className="text-[#00C896] text-2xl md:text-3xl font-mono font-bold tracking-wider">
                          {roomCode}
                        </p>
                        <button
                          onClick={copyLink}
                          className="mt-3 px-4 py-2 bg-[#00C896]/20 text-[#00C896] text-sm min-h-[44px]"
                        >
                          {copied ? "✓ Link Copied" : "🔗 Copy Join Link"}
                        </button>
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Local video PIP - Mobile optimized */}
        <div className="absolute top-safe right-2 w-20 h-28 sm:w-24 sm:h-32 md:w-40 md:h-56 bg-black/50 overflow-hidden shadow-2xl border border-white/20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          {isVideoOff && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <span className="text-2xl md:text-3xl">📵</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 md:px-2 md:py-1">
            <p className="text-white text-[10px] md:text-xs truncate">
              {userName} {getFlag(userLang)}
            </p>
          </div>
        </div>

        {/* Header - Mobile optimized */}
        <div className="absolute top-safe left-2 right-24 sm:right-28 md:right-44 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px]">
            <div
              className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${statusColor}`}
            />
            <span className="text-gray-400 text-xs md:text-sm font-mono">
              #{roomCode}
            </span>
          </div>

          {/* Call Duration Timer */}
          {hasPartner && callDuration > 0 && (
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px]">
              <span className="text-white text-xs md:text-sm font-mono">
                {formatDuration(callDuration)}
              </span>
            </div>
          )}

          {/* Connection Quality Indicator */}
          {hasPartner && quality && (
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px]">
              {/* Quality bars */}
              <div className="flex items-end gap-0.5 h-4">
                {[1, 2, 3, 4].map((bar) => {
                  const { count, color } = getQualityBars(quality);
                  return (
                    <div
                      key={bar}
                      className={`w-1 rounded-sm transition-all ${
                        bar <= count ? color : "bg-gray-600"
                      }`}
                      style={{ height: `${bar * 4}px` }}
                    />
                  );
                })}
              </div>
              {/* Show RTT on larger screens */}
              <span className="hidden md:inline text-gray-400 text-xs">
                {quality.rtt}ms
              </span>
            </div>
          )}

          {/* Unstable connection warning */}
          {hasPartner && quality && quality.quality === "poor" && (
            <div className="flex items-center gap-1.5 bg-red-500/20 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px] border border-red-500/30">
              <span className="text-red-400 text-[10px] md:text-xs">
                ⚠️ Unstable
              </span>
            </div>
          )}

          {/* ICE Connection State Indicator */}
          {iceState && iceState !== "connected" && iceState !== "completed" && (
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px]">
              <div
                className={`w-2 h-2 rounded-full ${
                  iceState === "checking" || iceState === "new"
                    ? "bg-yellow-500 animate-pulse"
                    : iceState === "disconnected"
                      ? "bg-orange-500"
                      : iceState === "failed"
                        ? "bg-red-500"
                        : "bg-gray-500"
                }`}
              />
              <span className="text-gray-400 text-[10px] md:text-xs">
                {iceState === "checking" || iceState === "new"
                  ? "Connecting..."
                  : iceState === "disconnected"
                    ? "Reconnecting..."
                    : iceState === "failed"
                      ? "Connection lost"
                      : iceState}
              </span>
            </div>
          )}

          {hasPartner && (
            <>
              {/* Font Size Toggle */}
              <button
                onClick={() =>
                  setFontSize((prev) =>
                    prev === "small"
                      ? "medium"
                      : prev === "medium"
                        ? "large"
                        : "small",
                  )
                }
                className="bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-h-[44px] text-white hover:text-[#00C896] transition-colors"
                title={`Caption size: ${fontSize}`}
              >
                {fontSize === "small"
                  ? "A"
                  : fontSize === "medium"
                    ? "A+"
                    : "A++"}
              </button>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-h-[44px] ${showHistory ? "text-[#00C896]" : "text-white"}`}
              >
                📜 {transcript.length > 0 && `(${transcript.length})`}
              </button>
            </>
          )}
        </div>

        {/* LIVE CAPTIONS - Mobile responsive */}
        <div className="absolute bottom-20 md:bottom-24 inset-x-0 px-2 md:px-4 space-y-2 md:space-y-3 pointer-events-none">
          {/* Partner's speech */}
          {theirLiveText && (
            <div className="flex justify-start caption-slide-in">
              <div className="max-w-[95%] md:max-w-[75%]">
                <div className="bg-purple-500/20 backdrop-blur-xl border border-purple-500/30 px-3 py-2 md:px-4 md:py-3 shadow-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-purple-400 text-xs font-medium">
                      {partnerName || "Partner"}
                    </span>
                    <span className="text-purple-400/50 text-xs">
                      {getFlag(partnerLang || "es")}
                    </span>
                  </div>
                  <p className="text-white/90 text-xs md:text-sm leading-relaxed mb-1">
                    {theirLiveText}
                  </p>
                  {theirLiveTranslation && (
                    <p
                      className={`text-white font-medium leading-relaxed ${
                        fontSize === "small"
                          ? "text-sm md:text-base"
                          : fontSize === "medium"
                            ? "text-base md:text-lg"
                            : "text-lg md:text-2xl"
                      }`}
                    >
                      {theirLiveTranslation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* My speech */}
          {myLiveText && (
            <div className="flex justify-end caption-slide-in">
              <div className="max-w-[95%] md:max-w-[75%]">
                <div className="bg-[#00C896]/20 backdrop-blur-xl border border-[#00C896]/30 px-3 py-2 md:px-4 md:py-3 shadow-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[#00C896] text-xs font-medium">
                      You
                    </span>
                    <span className="text-[#00C896]/50 text-xs">
                      {getFlag(userLang)}
                    </span>
                  </div>
                  <p className="text-white/90 text-xs md:text-sm leading-relaxed mb-1">
                    {myLiveText}
                    <span className="inline-block w-0.5 h-3 md:h-4 bg-white/90 ml-1 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p
                      className={`text-[#00C896] font-medium leading-relaxed ${
                        fontSize === "small"
                          ? "text-sm md:text-base"
                          : fontSize === "medium"
                            ? "text-base md:text-lg"
                            : "text-lg md:text-2xl"
                      }`}
                    >
                      → {myLiveTranslation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History Panel - Mobile full width */}
        {showHistory && (
          <div className="absolute inset-x-0 md:left-4 md:right-auto top-14 md:top-16 bottom-24 md:bottom-28 md:w-96 bg-black/95 md:bg-black/90 backdrop-blur-xl border-y md:border border-white/10 flex flex-col z-10">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium text-sm md:text-base">
                History
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  Start speaking to see history
                </p>
              ) : (
                transcript.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-2 md:p-3 ${entry.speaker === "me" ? "bg-[#00C896]/10 border-l-2 border-[#00C896]" : "bg-purple-500/10 border-l-2 border-purple-500"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium ${entry.speaker === "me" ? "text-[#00C896]" : "text-purple-400"}`}
                      >
                        {entry.name}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {entry.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-white text-sm">{entry.original}</p>
                    <p className="text-gray-400 text-sm mt-1">
                      → {entry.translated}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Cyrano Panel - Mobile: slides up from bottom, Desktop: right sidebar */}
        {cyranoOpen && (
          <div className="absolute inset-x-0 bottom-20 md:inset-x-auto md:top-0 md:right-0 md:bottom-20 md:w-[320px] p-3 z-20 cyrano-panel-in">
            <CyranoPanel
              cyrano={cyrano}
              onSuggestionPick={(text) => setCyranoPhrase(text)}
              onClose={() => setCyranoOpen(false)}
            />
          </div>
        )}

        {/* Cyrano Quick Suggestions Strip - Shows inline when panel is closed but suggestions exist */}
        {cyrano.isActive &&
          !cyranoOpen &&
          cyrano.suggestions.length > 0 &&
          !cyrano.isThinking && (
            <div
              className={`absolute ${cyranoPhrase ? "top-20" : "top-4"} left-4 right-4 z-25 cyrano-slide-down`}
              style={{ zIndex: 25 }}
            >
              <div
                className="flex items-stretch gap-2 p-2 rounded-xl overflow-hidden"
                style={{
                  background: "rgba(6,6,10,0.92)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                }}
              >
                {/* Suggestions scroll container */}
                <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide">
                  {cyrano.suggestions.slice(0, 3).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        navigator.clipboard.writeText(s.text).catch(() => {});
                        setCyranoPhrase(s.text);
                        cyrano.dismissSuggestions();
                      }}
                      className="flex-shrink-0 max-w-[200px] md:max-w-[280px] px-3 py-2 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${TONE_COLORS[s.tone]}40`,
                      }}
                    >
                      <span className="text-white/80 text-xs line-clamp-2 leading-relaxed">
                        {s.text}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Expand button */}
                <button
                  onClick={() => setCyranoOpen(true)}
                  className="flex-shrink-0 px-2 flex items-center justify-center text-amber-400/60 hover:text-amber-400 transition-colors"
                  title="Open Cyrano panel"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>

                {/* Dismiss button */}
                <button
                  onClick={() => cyrano.dismissSuggestions()}
                  className="flex-shrink-0 px-2 flex items-center justify-center text-white/20 hover:text-white/50 transition-colors"
                  title="Dismiss suggestions"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

        {/* Cyrano indicator when active but panel closed and no suggestions */}
        {cyrano.isActive && !cyranoOpen && cyrano.suggestions.length === 0 && (
          <div
            className={`absolute ${cyranoPhrase ? "top-20" : "top-4"} right-4 z-20`}
          >
            <button
              onClick={() => setCyranoOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105"
              style={{
                background: "rgba(6,6,10,0.88)",
                border: "1px solid rgba(245,158,11,0.4)",
                color: "#f59e0b",
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Cyrano
            </button>
          </div>
        )}
      </div>

      {/* Controls - Mobile optimized with flex wrap */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-2 md:px-4 py-3 md:py-4 safe-area-bottom">
        <div className="flex items-center justify-center gap-3 md:gap-4 flex-wrap">
          <button
            onClick={toggleMute}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all ${
              isMuted
                ? "bg-red-500 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>

          <button
            onClick={toggleVideo}
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all ${
              isVideoOff
                ? "bg-red-500 text-white"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {isVideoOff ? "📵" : "📹"}
          </button>

          {/* Cyrano Mode Toggle */}
          <button
            onClick={() => setCyranoOpen((v) => !v)}
            title="Cyrano Mode"
            className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all active:scale-95 relative"
            style={{
              background: cyrano.isActive
                ? cyranoOpen
                  ? "rgba(245,158,11,0.25)"
                  : "rgba(245,158,11,0.15)"
                : cyranoOpen
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.1)",
              border: cyrano.isActive
                ? "1.5px solid rgba(245,158,11,0.5)"
                : "1.5px solid transparent",
              boxShadow: cyrano.isActive
                ? "0 0 16px rgba(245,158,11,0.2)"
                : "none",
            }}
          >
            🎭
            {cyrano.isActive && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isConnected}
            className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all ${
              !isConnected
                ? "bg-gray-700 text-gray-500"
                : isListening
                  ? "bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/50"
                  : "bg-gradient-to-br from-[#00C896] to-blue-600 text-white shadow-lg shadow-[#00C896]/50"
            }`}
          >
            {isListening ? (
              <div className="flex items-center gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full animate-soundwave"
                    style={{
                      height: `${12 + Math.sin(i * 0.8) * 8}px`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <svg
                className="w-6 h-6 md:w-8 md:h-8"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z" />
              </svg>
            )}
          </button>

          <button
            onClick={endCall}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-red-500 text-white flex items-center justify-center text-lg md:text-xl hover:bg-red-600 transition-all"
          >
            📞
          </button>
        </div>

        <p className="text-center text-xs md:text-sm mt-2 md:mt-3 text-gray-400">
          {!isConnected ? (
            statusMessage
          ) : isListening ? (
            <span className="text-green-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live Translating
            </span>
          ) : (
            "Tap mic to translate"
          )}
        </p>
      </div>

      <style jsx>{`
        @keyframes blink {
          0%,
          50% {
            opacity: 1;
          }
          51%,
          100% {
            opacity: 0;
          }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
        @keyframes soundwave {
          0%,
          100% {
            transform: scaleY(0.5);
          }
          50% {
            transform: scaleY(1);
          }
        }
        .animate-soundwave {
          animation: soundwave 0.5s ease-in-out infinite;
        }

        .safe-area-bottom {
          padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
        }
        .top-safe {
          top: max(0.5rem, env(safe-area-inset-top));
        }

        @keyframes caption-slide {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .caption-slide-in {
          animation: caption-slide 0.2s ease-out;
        }

        /* Cyrano animations */
        @keyframes cyrano-slide-down {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .cyrano-slide-down {
          animation: cyrano-slide-down 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes cyrano-panel-in {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .cyrano-panel-in {
          animation: cyrano-panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes cyrano-pulse {
          0%,
          80%,
          100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        /* Quick suggestions strip utilities */
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}

export default function VideoCallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VideoCallContent />
    </Suspense>
  );
}
