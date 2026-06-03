"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  getCamera,
  stopCamera,
  type IceConnectionState,
  type ConnectionQuality,
} from "../../lib/peer-connection";
import { DailyConnection } from "../../lib/daily-connection";
import { getSpeechCode, getFlag, getLanguage } from "../../lib/languages";
import type {
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
import TextInputFallback from "../../components/TextInputFallback";
import PostCallSummary from "../../components/PostCallSummary";
import OfflinePhrases from "../../components/OfflinePhrases";
import CulturalWhisper from "../../components/CulturalWhisper";
// BackTranslationBadge removed from live captions (available in history panel)
import { useConversationMemory } from "@/hooks/useConversationMemory";
import { useVoiceDubbing } from "@/hooks/useVoiceDubbing";
import { useRemoteTranscription } from "@/hooks/useRemoteTranscription";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { useCallRecording } from "@/hooks/useCallRecording";
import RecordingIndicator from "../../components/RecordingIndicator";
import { saveRecording } from "@/app/lib/recording-storage";

// Text-to-Speech helper — loud and fast
// iOS Safari: voices load asynchronously; we must wait for them before speaking.
const speakText = (text: string, lang: string) => {
  if (!text.trim() || typeof window === "undefined") return;

  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    const speechCode = getSpeechCode(lang);
    utterance.lang = speechCode;
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Explicitly assign a voice matching the target language
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.startsWith(speechCode.split("-")[0]));
    if (match) utterance.voice = match;

    // iOS Safari: small delay after cancel() prevents silent drops
    setTimeout(() => window.speechSynthesis.speak(utterance), 100);
  };

  // If voices aren't loaded yet (common on iOS Safari), wait for them
  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    const onVoicesReady = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesReady);
      doSpeak();
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesReady);
    // Safety timeout — don't wait forever if voiceschanged never fires
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesReady);
      doSpeak();
    }, 2000);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CALL - Raw WebRTC P2P with Supabase Signaling
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
            <span className="text-xs text-white/70 font-medium">
              {activeMode.emoji} {activeMode.label}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/70 hover:text-white/90 hover:bg-white/[0.06] transition-all"
        >
          ✕
        </button>
      </div>

      {/* Setup (not active) - ONBOARDING */}
      {!isActive && (
        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                className="absolute top-2 right-2 text-amber-400/50 hover:text-amber-400 text-xs min-w-[44px] min-h-[44px] flex items-center justify-center"
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

          <p className="text-white/70 text-xs text-center tracking-wide">
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
                  <span className="text-[11px] text-white/70 block truncate">
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
          <p className="text-white/70 text-[11px] text-center leading-relaxed px-2">
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
                      : "rgba(255,255,255,0.70)",
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
              <span className="text-white/70 text-xs italic">
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
                inputMode="text"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                spellCheck={true}
                enterKeyHint="send"
                className="flex-1 bg-white/[0.05] border border-white/[0.09] rounded-lg px-3 py-2 text-white/80 text-base placeholder:text-white/70 outline-none focus:border-amber-400/40 focus:bg-white/[0.07] transition-all min-h-[44px]"
              />
              <button
                onClick={submitManual}
                disabled={!manualInput.trim()}
                className="px-3 py-2 bg-amber-400 disabled:bg-white/10 rounded-lg text-black disabled:text-white/70 text-xs font-bold transition-all hover:bg-amber-300 disabled:cursor-not-allowed min-w-[44px] min-h-[44px]"
              >
                →
              </button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                <span className="text-white/70 text-xs tracking-wide">
                  Thinking...
                </span>
              </div>
            )}

            {!isThinking && suggestions.length === 0 && !liveCaption && (
              <div className="flex flex-col items-center justify-center py-5 gap-2">
                <span className="text-2xl opacity-20">{activeMode.emoji}</span>
                <p className="text-white/70 text-xs text-center max-w-[200px] leading-relaxed">
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
                  className="text-white/70 text-[11px] hover:text-white/90 transition-colors min-h-[36px] px-2"
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
              <span className="text-white/70 text-xs">
                {isListening ? "Listening" : "Mic off"}
              </span>
            </div>
            <div className="flex gap-2">
              {transcript.length > 0 && (
                <button
                  onClick={clearTranscript}
                  className="text-white/70 text-xs hover:text-white/90 transition-colors min-w-[44px] min-h-[44px] px-3"
                >
                  clear
                </button>
              )}
              <button
                onClick={deactivate}
                className="text-red-400/60 text-xs font-medium hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] px-3"
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
          style={{ color: copied ? "#10b981" : "rgba(255,255,255,0.70)" }}
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

  // Validate room ID format (alphanumeric, 4-8 characters)
  useEffect(() => {
    if (!/^[A-Za-z0-9]{4,8}$/.test(roomCode)) {
      router.replace("/");
    }
  }, [roomCode, router]);

  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") || "User";
  const initialUserLang = searchParams.get("lang") || "en";

  // Reconnection state
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [maxReconnectAttempts] = useState(5);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  // Lobby state - EVERYONE sees lobby now (ensures camera/mic permissions granted before connecting)
  // Previously guests skipped lobby, causing black screen + no audio when permissions weren't granted
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
  const partnerDeviceIdRef = useRef<string>("");

  // Media state
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Translation state
  const [translationEnabled, setTranslationEnabled] = useState(true); // User toggle for mic/translation
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

  // Text Input Fallback state
  const [showTextInput, setShowTextInput] = useState(false);

  // Post-Call Summary state
  const [showPostCall, setShowPostCall] = useState(false);

  // Offline Phrases state
  const [showOfflinePhrases, setShowOfflinePhrases] = useState(false);

  // iOS Safari autoplay workaround — shows "Tap to hear audio" overlay
  const [needsAudioUnmute, setNeedsAudioUnmute] = useState(false);

  // Learning Mode state
  const [learningMode, setLearningMode] = useState(false);

  // Cultural Whispers state
  const [culturalWhispersEnabled] = useState(true);

  // Conversation Memory
  const conversationMemory = useConversationMemory();

  // Cyrano Mode state
  const [cyranoOpen, setCyranoOpen] = useState(false);
  const [cyranoPhrase, setCyranoPhrase] = useState("");
  const cyrano = useCyrano({ initialMode: "date", userLanguage: userLang });
  const cyranoEnabledOnJoinRef = useRef(false);

  // Refs (need to be defined before useTranscription hook)
  const peerRef = useRef<DailyConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // WebRTC sendMessage wrapper for useTranscription hook
  const sendWebRTCMessage = useCallback((message: string): boolean => {
    if (!peerRef.current) return false;
    try {
      // Parse and send as object (PeerConnection expects objects)
      const parsed = JSON.parse(message);
      const sent = peerRef.current.send(parsed);
      if (!sent && parsed.isFinal) {
        console.warn("[Call] DataChannel send failed — channel not open");
      }
      return sent;
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
    isActive: status === "connected" && hasPartner && !inLobby && translationEnabled,
  });

  // Sync transcription hook output to UI state — streaming updates
  useEffect(() => {
    // Show interim text while speaking, final text briefly after
    if (transcription.localCaption) {
      // Truncate to last 150 chars to prevent wall of text
      setMyLiveText(transcription.localCaption);
    } else if (transcription.localFinal) {
      setMyLiveText(transcription.localFinal);
      // Clear after 5s (was 2s — too fast to read)
      const wordCount = transcription.localFinal.split(/\s+/).length;
      const displayTime = Math.min(Math.max(5000, wordCount * 400), 10000);
      const timeout = setTimeout(() => {
        setMyLiveText("");
        setMyLiveTranslation("");
      }, displayTime);
      return () => clearTimeout(timeout);
    } else {
      setMyLiveText("");
    }
  }, [transcription.localCaption, transcription.localFinal]);

  useEffect(() => {
    if (transcription.localTranslated) {
      setMyLiveTranslation(transcription.localTranslated);
      // Add to transcript when we have both final text and translation
      if (transcription.localFinal) {
        addToTranscript("me", userName, transcription.localFinal, transcription.localTranslated, userLang);
      }
    }
  }, [transcription.localTranslated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Feed user's finalized speech to Cyrano (no own SpeechRecognition needed)
  useEffect(() => {
    if (transcription.localFinal && cyrano.isActive) {
      cyrano.addYourLine(transcription.localFinal);
    }
  }, [transcription.localFinal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsListening(transcription.isListening);
  }, [transcription.isListening]);

  useEffect(() => {
    if (transcription.error) {
      console.warn("[Transcription]", transcription.error);
    }
  }, [transcription.error]);

  // ── Voice Dubbing (additive — does not affect subtitle system) ──────────
  const {
    state: dubbingState,
    enable: enableDubbing,
    disable: disableDubbing,
    processTranscript: processDub,
    cleanup: cleanupDubbing,
    isDubPlaying,
  } = useVoiceDubbing(remoteStreamRef.current, userLang);

  // Mute partner's raw voice when dub is playing (no overlapping voices)
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (video) {
      video.muted = isDubPlaying;
    }
    return () => {
      // Ensure remote video is unmuted when dubbing stops or component unmounts
      if (video) {
        video.muted = false;
      }
    };
  }, [isDubPlaying]);

  // ── Call Recording ───────────────────────────────────────────────────────
  const callRecording = useCallRecording();

  // ── Remote audio fallback transcription (activates if partner's STT fails) ──
  const remoteTranscription = useRemoteTranscription({
    remoteStream: remoteStreamRef.current,
    partnerLang: partnerLang || expectedPartnerLang,
    myLang: userLang,
    isActive: status === "connected" && hasPartner && !inLobby && translationEnabled,
  });
  const onPartnerMessageRef = useRef(remoteTranscription.onPartnerMessage);
  useEffect(() => {
    onPartnerMessageRef.current = remoteTranscription.onPartnerMessage;
  }, [remoteTranscription.onPartnerMessage]);

  // Show fallback remote transcription when active
  useEffect(() => {
    if (remoteTranscription.isFallbackActive && remoteTranscription.remoteText) {
      setTheirLiveText(remoteTranscription.remoteText);
    }
  }, [remoteTranscription.remoteText, remoteTranscription.isFallbackActive]);

  useEffect(() => {
    if (remoteTranscription.isFallbackActive && remoteTranscription.remoteTranslation) {
      setTheirLiveTranslation(remoteTranscription.remoteTranslation);
      // Speak the translation
      speakText(remoteTranscription.remoteTranslation, userLang);
    }
  }, [remoteTranscription.remoteTranslation, remoteTranscription.isFallbackActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ref so handleDataMessage can access dubbing without stale closure
  const processDubRef = useRef(processDub);
  const dubbingEnabledRef = useRef(dubbingState.isEnabled);
  useEffect(() => {
    processDubRef.current = processDub;
    dubbingEnabledRef.current = dubbingState.isEnabled;
  }, [processDub, dubbingState.isEnabled]);

  // Quality monitoring state
  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callStartTimeRef = useRef<number | null>(null);

  // Refs (peerRef, localStreamRef defined above for useTranscription)
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const isListeningRef = useRef(false);
  const mountedRef = useRef(true);
  const theirCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref for handleDataMessage to avoid stale closure in PeerConnection callback
  const handleDataMessageRef = useRef<(data: unknown) => void>(() => {});

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // translationEnabled=true by default — auto-starts when connected

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
  // WEBRTC CONNECTION SETUP - Only runs after leaving lobby
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

        // Create WebRTC connection
        const peer = new DailyConnection({
          onStatusChange: (peerStatus, message) => {
            if (!mountedRef.current) return;
            // Peer status update

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
            // Got remote stream
            remoteStreamRef.current = stream;
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              // Explicit play() for iOS Safari — autoPlay alone can fail for non-muted media.
              // If autoplay is blocked, show a tap-to-hear overlay instead of silently failing.
              remoteVideoRef.current.play().catch((err) => {
                console.error("[Entrevoz Video] Autoplay blocked:", err?.message || err);
                setNeedsAudioUnmute(true);
              });
            }
            // Mark that we have a remote stream - enables mic even if hello wasn't received
            setHasRemoteStream(true);
            setHasPartner(true); // If we got video, partner is definitely connected
          },
          onDataMessage: (data: unknown) => {
            if (!mountedRef.current) return;
            handleDataMessageRef.current(data);
          },
          onPartnerJoined: (name) => {
            if (!mountedRef.current) return;
            // Partner joined
            setPartnerName(name);
            setHasPartner(true);
          },
          onPartnerInfo: (info) => {
            if (!mountedRef.current) return;
            if (info.deviceId) partnerDeviceIdRef.current = info.deviceId;
            if (info.lang) setPartnerLang(info.lang);
          },
          onPartnerLeft: () => {
            if (!mountedRef.current) return;
            // Partner left
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
            // ICE state change
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
          { deviceId: getDeviceId(), lang: userLang },
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

    // Force-destroy peer on page close/refresh (React cleanup doesn't reliably run)
    const handleUnload = () => {
      if (peerRef.current) {
        peerRef.current.disconnect();
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    // PHONE CALL RECOVERY: When user returns from a phone call or app switch,
    // iOS/Android kills camera+mic tracks. Detect this and re-acquire media.
    const handleVisibilityChange = async () => {
      if (document.hidden || !mountedRef.current) return;

      // Page is visible again — check if media tracks are still alive
      const stream = localStreamRef.current;
      if (!stream) return;

      const tracksAlive = stream.getTracks().some((t) => t.readyState === "live");
      if (tracksAlive) return; // Tracks still good, no recovery needed

      console.log("[Entrevoz] Media tracks died (phone call?) — re-acquiring camera");
      try {
        const newStream = await getCamera("user");
        localStreamRef.current = newStream;

        // Update local video preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }

        // Update Daily.co with new media tracks
        if (peerRef.current && "call" in peerRef.current) {
          const dailyConn = peerRef.current as unknown as { call: { setInputDevicesAsync: (opts: { audioSource: MediaStreamTrack; videoSource: MediaStreamTrack }) => Promise<void> } | null };
          if (dailyConn.call) {
            const videoTrack = newStream.getVideoTracks()[0];
            const audioTrack = newStream.getAudioTracks()[0];
            if (videoTrack && audioTrack) {
              await dailyConn.call.setInputDevicesAsync({
                audioSource: audioTrack,
                videoSource: videoTrack,
              });
              console.log("[Entrevoz] Media re-acquired after phone call interruption");
            }
          }
        }
      } catch (err) {
        console.error("[Entrevoz] Failed to re-acquire camera after interruption:", err);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
      }, 500);
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
    isFinal?: boolean;
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

      // Signal remote transcription fallback that partner is sending messages
      onPartnerMessageRef.current();

      // Clear existing timeout
      if (theirCaptionTimeoutRef.current) {
        clearTimeout(theirCaptionTimeoutRef.current);
      }

      // Handle NEW translation message format (from useTranscription hook)
      if (isTranslationMessage(parsed)) {
        const { text, original, from, isFinal } = parsed;

        // Track partner's language (fall back to expected if missing)
        const resolvedFrom = from || partnerLang || expectedPartnerLang;
        if (from) setPartnerLang(from);

        // Show only the latest segment (truncate long text)
        const displayOriginal = original || text;
        const displayTranslation = text;
        setTheirLiveText(displayOriginal);
        setTheirLiveTranslation(displayTranslation);

        // Voice output: either ElevenLabs dubbing OR browser TTS (never both)
        if (isFinal) {
          if (dubbingEnabledRef.current && text) {
            // Voice dubbing: pass the ALREADY TRANSLATED text (skip re-translation for speed)
            processDubRef.current(text, resolvedFrom, userLang);
          } else {
            // Fallback: browser TTS
            speakText(text, userLang);
          }
        }

        // Add to transcript only on final
        if (isFinal) {
          addToTranscript(
            "partner",
            partnerName || "Partner",
            original || text,
            text,
            resolvedFrom,
          );

          // Feed to Cyrano
          if (cyrano.isActive && original) {
            cyrano.addTheirLine(original);
          }
        }

        // Auto-clear: longer for longer text (min 5s, ~100ms per word, max 12s)
        const wordCount = (text || "").split(/\s+/).length;
        const displayTime = Math.min(Math.max(5000, wordCount * 400), 12000);
        theirCaptionTimeoutRef.current = setTimeout(() => {
          setTheirLiveText("");
          setTheirLiveTranslation("");
        }, displayTime);
        return;
      }

      // Handle NEW transcription message format (raw speech interim)
      if (isTranscriptionMessage(parsed)) {
        const { text, lang } = parsed;

        // Track partner's language
        if (lang) setPartnerLang(lang);

        // Show only last 150 chars of interim (prevents wall of text)
        setTheirLiveText(text);

        // Keep interim visible for 5s (partner is still speaking)
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
    [partnerName, userLang, partnerLang, expectedPartnerLang, cyrano],
  );

  // Keep ref in sync for stale-closure-proof PeerConnection callback
  useEffect(() => {
    handleDataMessageRef.current = (data: unknown) =>
      handleDataMessage(data as CaptionData | Record<string, unknown>);
  }, [handleDataMessage]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION & TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  // Translation is now handled by useTranscription hook

  // startListening / stopListening now just toggle the translationEnabled state
  // The useTranscription hook handles actual speech recognition
  const startListening = useCallback(() => {
    setTranslationEnabled(true);
  }, []);

  const stopListening = useCallback(() => {
    setTranslationEnabled(false);
    setMyLiveText("");
    setMyLiveTranslation("");
  }, []);

  // Auto-start is handled by useTranscription hook via isActive prop
  // translationEnabled=true by default, so translation starts automatically when connected

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

  const endCall = async () => {
    stopListening();
    cleanupDubbing();
    cyrano.deactivate();
    setCyranoOpen(false);
    setCyranoPhrase("");

    // Stop recording and save if active
    if (callRecording.isRecording) {
      const blob = await callRecording.stopRecording();
      if (blob && blob.size > 0) {
        const langPairStr = `${userLang} / ${partnerLang || expectedPartnerLang}`;
        saveRecording(blob, {
          date: new Date().toISOString(),
          partnerName: partnerName || "Unknown",
          durationSeconds: callRecording.recordingDuration,
          languagePair: langPairStr,
        }).catch((err) => console.error("[Call] Failed to save recording:", err));
      }
    }

    if (localStreamRef.current) {
      stopCamera(localStreamRef.current);
    }
    if (peerRef.current) {
      peerRef.current.disconnect();
    }
    // Save conversation memory
    if (transcript.length >= 2 && partnerName) {
      conversationMemory.saveCallMemory({
        partnerName,
        lang: partnerLang || expectedPartnerLang,
        duration: callDuration,
        languages: [userLang, partnerLang || expectedPartnerLang],
        messages: transcript.map((t) => ({ text: t.original, speaker: t.speaker })),
      });
    }

    // Bridge vocab to Language OS (fire and forget)
    if (transcript.length >= 2) {
      const langPair = `${userLang}-${partnerLang || expectedPartnerLang}`;
      fetch("/api/language-os/entrevoz-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getDeviceId(),
          languagePair: langPair,
          transcript: transcript.map((t) => ({ text: t.original, language: t.speaker === "me" ? userLang : (partnerLang || expectedPartnerLang) })),
          conversationId: roomCode,
          durationSeconds: callDuration,
        }),
      }).catch((err) => console.error("[Call] Bridge sync failed:", err));
    }

    // Save contact (fire and forget)
    if (partnerDeviceIdRef.current && partnerName) {
      fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerDeviceId: getDeviceId(),
          contactDeviceId: partnerDeviceIdRef.current,
          displayName: partnerName,
          language: partnerLang || expectedPartnerLang,
        }),
      }).catch((err) => console.error("[Call] Contact save failed:", err));
    }

    // Show post-call summary if we had any conversation
    if (transcript.length >= 2) {
      setShowPostCall(true);
    } else {
      router.push("/");
    }
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
  // In-app browser detection (WhatsApp, Instagram, Facebook, etc.)
  if (browserSupport.isInAppBrowser) {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="text-5xl">🌐</div>
          <h1 className="text-xl font-semibold text-white">
            Open in Your Browser
          </h1>
          <p className="text-white/60 text-sm leading-relaxed">
            This app needs camera and microphone access, which isn&apos;t available in this browser.
            Tap the button below to open in {browserSupport.isIOS ? "Safari" : "Chrome"}.
          </p>
          {browserSupport.isIOS ? (
            <div className="space-y-3">
              <p className="text-white/40 text-xs">
                Tap <span className="text-white font-medium">⋯</span> or <span className="text-white font-medium">Share</span> then <span className="text-white font-medium">&quot;Open in Safari&quot;</span>
              </p>
              <button
                onClick={() => navigator.clipboard?.writeText(currentUrl)}
                className="w-full py-3 px-4 rounded-xl bg-white/10 text-white text-sm font-medium border border-white/10 active:bg-white/20"
              >
                Copy Link
              </button>
            </div>
          ) : (
            <a
              href={`intent://${currentUrl.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`}
              className="block w-full py-3 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium text-center active:bg-blue-700"
            >
              Open in Chrome
            </a>
          )}
          <p className="text-white/30 text-xs">
            Or copy this link and paste it in your browser:<br/>
            <span className="text-white/50 break-all select-all">{currentUrl}</span>
          </p>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen-safe bg-black flex flex-col safe-x">
      {/* Video Container */}
      <div className="flex-1 relative overflow-hidden">
        {/* Remote Video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* iOS Safari autoplay blocked — tap to enable audio */}
        {needsAudioUnmute && (
          <button
            onClick={() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.play().then(() => {
                  setNeedsAudioUnmute(false);
                }).catch(() => {});
              }
            }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            aria-label="Tap to enable audio"
          >
            <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-white/10 border border-white/20">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span className="text-white text-sm font-medium">Tap to hear audio</span>
            </div>
          </button>
        )}

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
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-label="Cyrano suggestion"
          >
            <span className="text-amber-400 text-sm mt-0.5 shrink-0">🎭</span>
            <p className="text-white/90 text-sm leading-relaxed flex-1">
              {cyranoPhrase}
            </p>
            <button
              onClick={() => setCyranoPhrase("")}
              className="text-white/70 hover:text-white/90 transition-colors text-lg leading-none shrink-0 mt-0.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Dismiss suggestion"
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
                  <p
                    className="text-white text-lg md:text-xl mb-2"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
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
                          className="mt-3 px-4 py-2 bg-[#00C896]/20 text-[#00C896] text-sm min-w-[44px] min-h-[44px]"
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
        <div className="absolute top-safe right-1 sm:right-2 w-16 h-22 xs:w-20 xs:h-28 sm:w-24 sm:h-32 md:w-40 md:h-56 bg-black/50 overflow-hidden shadow-2xl border border-white/20 rounded-lg sm:rounded-none">
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
        <div className="absolute top-safe left-1 sm:left-2 right-18 xs:right-24 sm:right-28 md:right-44 flex items-center gap-1 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-1.5 bg-black/50 backdrop-blur px-1.5 sm:px-2 py-1 sm:py-1.5 md:px-3 md:py-2 min-h-[36px] sm:min-h-[44px] rounded-md sm:rounded-none">
            <div
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 md:w-2.5 md:h-2.5 rounded-full ${statusColor}`}
            />
            <span className="text-gray-400 text-[10px] sm:text-xs md:text-sm font-mono">
              #{roomCode}
            </span>
          </div>

          {/* Call Duration Timer */}
          {hasPartner && callDuration > 0 && (
            <div className="flex items-center gap-1 sm:gap-1.5 bg-black/50 backdrop-blur px-1.5 sm:px-2 py-1 sm:py-1.5 md:px-3 md:py-2 min-h-[36px] sm:min-h-[44px] rounded-md sm:rounded-none">
              <span className="text-white text-[10px] sm:text-xs md:text-sm font-mono">
                {formatDuration(callDuration)}
              </span>
            </div>
          )}

          {/* Recording Indicator */}
          {callRecording.isRecording && (
            <RecordingIndicator durationSeconds={callRecording.recordingDuration} />
          )}

          {/* Connection Quality Indicator */}
          {hasPartner && quality && (
            <div className="hidden xs:flex items-center gap-1 sm:gap-1.5 bg-black/50 backdrop-blur px-1.5 sm:px-2 py-1 sm:py-1.5 md:px-3 md:py-2 min-h-[36px] sm:min-h-[44px] rounded-md sm:rounded-none">
              {/* Quality bars */}
              <div className="flex items-end gap-0.5 h-3 sm:h-4">
                {[1, 2, 3, 4].map((bar) => {
                  const { count, color } = getQualityBars(quality);
                  return (
                    <div
                      key={bar}
                      className={`w-0.5 sm:w-1 rounded-sm transition-all ${
                        bar <= count ? color : "bg-gray-600"
                      }`}
                      style={{ height: `${bar * 3}px` }}
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
            <div
              className="flex items-center gap-1.5 bg-red-500/20 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px] border border-red-500/30"
              role="alert"
              aria-live="assertive"
            >
              <span className="text-red-400 text-[10px] md:text-xs">
                ⚠️ Unstable
              </span>
            </div>
          )}

          {/* ICE Connection State Indicator */}
          {iceState && iceState !== "connected" && iceState !== "completed" && (
            <div
              className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 min-h-[44px]"
              role="status"
              aria-live={iceState === "failed" ? "assertive" : "polite"}
              aria-atomic="true"
            >
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
                className="bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-w-[44px] min-h-[44px] text-white hover:text-[#00C896] transition-colors"
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
                className={`bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-w-[44px] min-h-[44px] ${showHistory ? "text-[#00C896]" : "text-white"}`}
              >
                📜 {transcript.length > 0 && `(${transcript.length})`}
              </button>
            </>
          )}
        </div>

        {/* Cultural Whisper */}
        {theirLiveText && (
          <div className="absolute bottom-44 md:bottom-52 inset-x-0 px-3 md:px-4 pointer-events-auto z-10">
            <CulturalWhisper
              partnerLang={partnerLang || expectedPartnerLang}
              lastPartnerText={theirLiveText}
              enabled={culturalWhispersEnabled}
            />
          </div>
        )}

        {/* LIVE CAPTIONS - Compact subtitle style, max 3 lines */}
        <div className="absolute bottom-20 md:bottom-24 inset-x-0 px-2 md:px-4 space-y-1.5 pointer-events-none z-20 max-h-[40vh] overflow-y-auto">
          {/* Partner's speech */}
          {theirLiveText && (
            <div className="flex justify-start caption-slide-in">
              <div className="max-w-[95%] md:max-w-[80%]">
                <div className="bg-black/80 backdrop-blur-md rounded-lg px-3 py-2">
                  <p className="text-white/70 text-xs leading-snug">
                    <span className="text-purple-400 font-medium">{partnerName || "Partner"}</span>{" "}
                    {theirLiveText}
                  </p>
                  {theirLiveTranslation && (
                    <p
                      className={`text-white font-medium leading-snug mt-0.5 ${
                        fontSize === "small"
                          ? "text-sm"
                          : fontSize === "medium"
                            ? "text-base"
                            : "text-lg"
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
              <div className="max-w-[95%] md:max-w-[80%]">
                <div className="bg-black/80 backdrop-blur-md rounded-lg px-3 py-2">
                  <p className="text-white/70 text-xs leading-snug">
                    <span className="text-[#00C896] font-medium">You</span>{" "}
                    {myLiveText}
                    <span className="inline-block w-0.5 h-3 bg-white/70 ml-0.5 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p
                      className={`text-[#00C896] font-medium leading-snug mt-0.5 ${
                        fontSize === "small"
                          ? "text-sm"
                          : fontSize === "medium"
                            ? "text-base"
                            : "text-lg"
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
          <div
            className="absolute inset-x-0 md:left-4 md:right-auto top-14 md:top-16 bottom-24 md:bottom-28 md:w-96 bg-black/95 md:bg-black/90 backdrop-blur-xl border-y md:border border-white/10 flex flex-col z-10"
            role="region"
            aria-label="Conversation history"
          >
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium text-sm md:text-base">
                History
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close history"
              >
                ✕
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3"
              style={{ WebkitOverflowScrolling: 'touch' }}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
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
              onClose={() => {
                cyrano.deactivate();
                setCyranoOpen(false);
                setCyranoPhrase("");
              }}
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
                <div className="flex-1 flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  className="flex-shrink-0 px-2 flex items-center justify-center text-amber-400/60 hover:text-amber-400 transition-colors min-w-[44px] min-h-[44px]"
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
                  className="flex-shrink-0 px-2 flex items-center justify-center text-white/70 hover:text-white/90 transition-colors min-w-[44px] min-h-[44px]"
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105 min-w-[44px] min-h-[44px]"
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

      {/* Text Input Fallback */}
      <TextInputFallback
        visible={showTextInput}
        onDismiss={() => setShowTextInput(false)}
        sendMessage={sendWebRTCMessage}
        sourceLang={userLang}
        targetLang={partnerLang || expectedPartnerLang}
      />

      {/* Offline Phrases */}
      <OfflinePhrases
        visible={showOfflinePhrases}
        onDismiss={() => setShowOfflinePhrases(false)}
        sourceLang={userLang}
        targetLang={partnerLang || expectedPartnerLang}
      />

      {/* Controls - Mobile optimized with flex wrap */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-2 md:px-4 py-3 md:py-4 safe-area-bottom">
        {/* Voice dubbing status */}
        {dubbingState.isEnabled && dubbingState.phase !== "idle" && (
          <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b border-white/10">
            {dubbingState.phase === "sampling" && (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-zinc-400 text-xs">
                  Learning voice {dubbingState.samplingProgress}%...
                </span>
              </>
            )}
            {dubbingState.phase === "cloning" && (
              <>
                <div className="w-3 h-3 rounded-full border border-zinc-400 border-t-transparent animate-spin" />
                <span className="text-zinc-400 text-xs">Creating voice clone...</span>
              </>
            )}
            {dubbingState.phase === "ready" && (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-zinc-400 text-xs">
                  Voice dubbing active
                  {dubbingState.isPlaying && " · Speaking..."}
                </span>
              </>
            )}
            {dubbingState.phase === "error" && (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                <span className="text-zinc-500 text-xs">Voice dubbing error</span>
              </>
            )}
          </div>
        )}
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

          {/* Text Input Fallback */}
          <button
            onClick={() => setShowTextInput((v) => !v)}
            title="Type to translate"
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all ${
              showTextInput
                ? "bg-[#00C896]/20 text-[#00C896]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* Offline Phrases */}
          <button
            onClick={() => setShowOfflinePhrases((v) => !v)}
            title="Quick Phrases"
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all ${
              showOfflinePhrases
                ? "bg-[#00C896]/20 text-[#00C896]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </button>

          {/* Record Call */}
          {isConnected && (
            <button
              onClick={() => {
                if (callRecording.isRecording) {
                  callRecording.stopRecording().then((blob) => {
                    if (blob && blob.size > 0) {
                      const langPairStr = `${userLang} / ${partnerLang || expectedPartnerLang}`;
                      saveRecording(blob, {
                        date: new Date().toISOString(),
                        partnerName: partnerName || "Unknown",
                        durationSeconds: callRecording.recordingDuration,
                        languagePair: langPairStr,
                      }).catch((err) => console.error("[Call] Failed to save recording:", err));
                    }
                  });
                } else if (remoteStreamRef.current) {
                  callRecording.startRecording(remoteStreamRef.current);
                }
              }}
              title={callRecording.isRecording ? "Stop Recording" : "Record Call"}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all relative ${
                callRecording.isRecording
                  ? "bg-red-500/20 text-red-400 border-[1.5px] border-red-500/50"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              style={callRecording.isRecording ? { boxShadow: "0 0 16px rgba(239,68,68,0.2)" } : undefined}
            >
              {callRecording.isRecording ? (
                <div className="w-4 h-4 rounded-sm bg-red-500" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                  <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
                </svg>
              )}
              {callRecording.isRecording && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          )}

          {/* Cyrano Mode Toggle */}
          <button
            onClick={() => {
              if (cyrano.isActive && cyranoOpen) {
                // Panel open + active → deactivate and close
                cyrano.deactivate();
                setCyranoOpen(false);
                setCyranoPhrase("");
              } else {
                // Toggle panel open/closed
                setCyranoOpen((v) => !v);
              }
            }}
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

          {/* Voice Dubbing Toggle */}
          {isConnected && (
            <button
              onClick={() => dubbingState.isEnabled ? disableDubbing() : enableDubbing()}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all relative ${
                dubbingState.isEnabled
                  ? dubbingState.phase === "ready"
                    ? "bg-green-600 text-white"
                    : dubbingState.phase === "error"
                      ? "bg-zinc-800 text-zinc-500"
                      : "bg-amber-600 text-white"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
              title={
                dubbingState.phase === "sampling"
                  ? `Learning voice... ${dubbingState.samplingProgress}%`
                  : dubbingState.phase === "cloning"
                    ? "Creating voice clone..."
                    : dubbingState.phase === "ready"
                      ? "Voice dubbing active"
                      : dubbingState.phase === "error"
                        ? "Voice dubbing error"
                        : "Enable voice dubbing"
              }
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
              {dubbingState.phase === "sampling" && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-amber-800 animate-ping" />
                </div>
              )}
              {dubbingState.phase === "cloning" && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-400">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-800 border-t-transparent animate-spin" />
                </div>
              )}
              {dubbingState.phase === "ready" && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              )}
            </button>
          )}

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

        <p
          className="text-center text-xs md:text-sm mt-2 md:mt-3 text-gray-400"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
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

      {/* Post-Call Summary */}
      <PostCallSummary
        visible={showPostCall}
        messages={transcript.map((t) => ({
          original: t.original,
          translated: t.translated,
          sender: t.speaker,
          timestamp: t.timestamp.toISOString(),
        }))}
        duration={callDuration}
        languages={[userLang, partnerLang || expectedPartnerLang]}
        onClose={() => {
          setShowPostCall(false);
          router.push("/");
        }}
        onNewCall={() => {
          setShowPostCall(false);
          window.location.href = "/";
        }}
        hasRecording={callRecording.recordingBlob !== null}
        onDownloadRecording={callRecording.downloadRecording}
      />

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
        <div className="min-h-[100dvh] bg-black flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VideoCallContent />
    </Suspense>
  );
}
