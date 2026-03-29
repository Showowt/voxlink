"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { TalkConnection, TalkMessage } from "../../lib/talk-connection";
import { getSpeechCode, getFlag } from "../../lib/languages";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionInstance,
  SpeechRecognitionConstructor,
} from "../../lib/speech-types";
// Import to ensure global Window augmentation
import "../../lib/speech-types";
import {
  BrowserUnsupportedScreen,
  PermissionDeniedScreen,
  ConnectionFailedScreen,
  detectErrorType,
} from "../../components/ErrorScreens";
import ReconnectingOverlay from "../../components/ReconnectingOverlay";
import { useBrowserSupport } from "../../lib/browser-support";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXXO TALK MODE - FaceTime-Quality Live Translation
// Production-ready bidirectional translation with proper message sync
// ═══════════════════════════════════════════════════════════════════════════════

interface TranscriptEntry {
  id: string;
  speaker: "me" | "partner";
  name: string;
  original: string;
  translated: string;
  timestamp: Date;
  sourceLang: string;
  emoji?: string;
}

interface LiveTextPayload {
  text: string;
  sourceLang: string;
  [key: string]: unknown;
}

interface MessagePayload {
  id: string;
  speaker: string;
  original: string;
  sourceLang: string;
  timestamp: number;
  [key: string]: unknown;
}

const REACTION_EMOJIS = [
  "😊",
  "😂",
  "❤️",
  "👍",
  "🎉",
  "🔥",
  "😍",
  "🙌",
  "💯",
  "✨",
];

function TalkContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Browser support detection
  const browserSupport = useBrowserSupport();

  const roomId = params.id as string;

  // User configuration from URL params
  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") || "User";
  const userLang = searchParams.get("lang") || "en";
  // Default target language - used before partner connects
  const defaultTargetLang = userLang === "en" ? "es" : "en";

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Connection state
  const [connectionStatus, setConnectionStatus] =
    useState<string>("Connecting...");
  const [isConnected, setIsConnected] = useState(false);
  const [isRoomFull, setIsRoomFull] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerLang, setPartnerLang] = useState<string | null>(null);

  // Speech state
  const [isListening, setIsListening] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);

  // Live caption state
  const [myLiveText, setMyLiveText] = useState("");
  const [myLiveTranslation, setMyLiveTranslation] = useState("");
  const [partnerLiveText, setPartnerLiveText] = useState("");
  const [partnerLiveTranslation, setPartnerLiveTranslation] = useState("");

  // Transcript history
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  // Settings UI
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium",
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Refs for stable callbacks
  const connectionRef = useRef<TalkConnection | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  const isHandsFreeRef = useRef(false);
  // Partner language ref - keeps current value accessible in callbacks
  const partnerLangRef = useRef<string | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const liveTextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const liveTextDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const myCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const initRef = useRef(false);

  // Font size utility
  const fontSizeClasses = {
    small: "text-sm",
    medium: "text-base",
    large: "text-xl",
  };

  // Sync refs with state
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  // Keep partner language ref in sync
  useEffect(() => {
    partnerLangRef.current = partnerLang;
  }, [partnerLang]);

  // Auto-scroll transcript
  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript]);

  // Haptic feedback - DISABLED on Android due to infinite vibration bug
  // Android's Web Vibration API has issues with rapid calls causing runaway vibration
  const isAndroidRef = useRef<boolean>(
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent),
  );
  const lastVibrateRef = useRef<number>(0);
  const vibrateCountRef = useRef<number>(0);

  const vibrate = useCallback((pattern: number | number[] = 50) => {
    // Completely disable vibration on Android - the Web Vibration API is too buggy
    if (isAndroidRef.current) {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      // Throttle to max 1 vibration per 500ms
      const now = Date.now();
      if (now - lastVibrateRef.current < 500) {
        return;
      }

      // Circuit breaker: max 10 vibrations per minute
      if (now - lastVibrateRef.current > 60000) {
        vibrateCountRef.current = 0;
      }
      if (vibrateCountRef.current >= 10) {
        return;
      }

      lastVibrateRef.current = now;
      vibrateCountRef.current++;
      navigator.vibrate(pattern);
    }
  }, []);

  // Cancel any ongoing vibration
  const cancelVibration = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(0);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION API
  // ═══════════════════════════════════════════════════════════════════════════

  const translate = useCallback(
    async (text: string, from: string, to: string): Promise<string> => {
      if (!text.trim()) return text;

      // Normalize language codes (handle cases like "en-US" -> "en")
      const fromLang = from.split("-")[0].toLowerCase();
      const toLang = to.split("-")[0].toLowerCase();

      // Same language - no translation needed
      if (fromLang === toLang) {
        console.log(`[Translation] Same language (${fromLang}), skipping`);
        return text;
      }

      // Retry logic for reliability
      const maxRetries = 2;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[Translation] Retry attempt ${attempt}...`);
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }

          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              sourceLang: fromLang,
              targetLang: toLang,
            }),
          });

          if (!res.ok) {
            throw new Error(`API ${res.status}`);
          }

          const data = await res.json();
          const result = data.translation || data.translated || text;

          // Verify we got a real translation
          if (result && result.toLowerCase() !== text.toLowerCase()) {
            console.log(
              `[Translation] ${fromLang}→${toLang}: "${text.slice(0, 15)}..." → "${result.slice(0, 15)}..."`,
            );
            return result;
          }

          // API returned same text - might have failed silently
          if (attempt < maxRetries) {
            console.warn(`[Translation] Got original back, retrying...`);
            continue;
          }
          return result;
        } catch (err) {
          console.error(`[Translation] Attempt ${attempt + 1} failed:`, err);
          if (attempt === maxRetries) {
            return text;
          }
        }
      }
      return text;
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SEND TO PARTNER - Stable reference
  // ═══════════════════════════════════════════════════════════════════════════

  const sendToPartner = useCallback((message: TalkMessage) => {
    if (connectionRef.current) {
      connectionRef.current.send(message);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const addToTranscript = useCallback(
    (entry: TranscriptEntry) => {
      if (!entry.original.trim()) return;

      setTranscript((prev) => {
        // Dedupe by ID
        if (prev.some((e) => e.id === entry.id)) {
          return prev;
        }
        return [...prev, entry];
      });

      vibrate(entry.speaker === "partner" ? 100 : [30, 20, 30]);
    },
    [vibrate],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PEERJS CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    // Prevent double initialization (React StrictMode)
    if (initRef.current) return;
    initRef.current = true;
    mountedRef.current = true;

    const connection = new TalkConnection({
      onStatusChange: (status, message) => {
        if (!mountedRef.current) return;
        setConnectionStatus(message || status);
        setIsConnected(status === "connected");
        if (status === "room_full") {
          setIsRoomFull(true);
        }
      },

      onMessage: async (msg: TalkMessage) => {
        if (!mountedRef.current) return;

        const data = msg.data as Record<string, unknown>;

        // ═══════════════════════════════════════════════════════════════════
        // COMPLETE MESSAGE FROM PARTNER
        // ═══════════════════════════════════════════════════════════════════
        if (msg.type === "message") {
          // Extract source language - support any language code
          const rawSourceLang = String(
            data.sourceLang || data.lang || "",
          ).toLowerCase();
          const partnerSourceLang = rawSourceLang || defaultTargetLang;

          const payload: MessagePayload = {
            id: String(
              data.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            ),
            speaker: String(data.speaker || "Partner"),
            original: String(data.original || ""),
            sourceLang: partnerSourceLang,
            timestamp: Number(data.timestamp) || Date.now(),
          };

          console.log(
            `[Message] Partner (${partnerSourceLang}) said: "${payload.original.slice(0, 30)}..." → translating to ${userLang}`,
          );

          // Track partner's language
          setPartnerLang(partnerSourceLang);

          // Translate FROM partner's language INTO our language
          const translatedForUs = await translate(
            payload.original,
            partnerSourceLang,
            userLang,
          );

          if (!mountedRef.current) return;

          console.log(
            `[Message] Translation result: "${translatedForUs.slice(0, 30)}..."`,
          );

          addToTranscript({
            id: payload.id,
            speaker: "partner",
            name: payload.speaker,
            original: payload.original,
            translated: translatedForUs,
            timestamp: new Date(payload.timestamp),
            sourceLang: partnerSourceLang,
          });

          // Clear partner live preview
          setPartnerLiveText("");
          setPartnerLiveTranslation("");
        }

        // ═══════════════════════════════════════════════════════════════════
        // LIVE STREAMING TEXT FROM PARTNER
        // ═══════════════════════════════════════════════════════════════════
        if (msg.type === "live") {
          const incomingText = String(data.text || "");
          // Extract source language - support any language code
          const rawSourceLang = String(data.sourceLang || "").toLowerCase();
          const incomingLang = rawSourceLang || defaultTargetLang;

          // Track partner's language
          setPartnerLang(incomingLang);
          setPartnerLiveText(incomingText);

          // Translate into our language
          if (incomingText.trim()) {
            console.log(
              `[Live] Partner (${incomingLang}): "${incomingText.slice(0, 30)}..." → ${userLang}`,
            );
            const translatedLive = await translate(
              incomingText,
              incomingLang,
              userLang,
            );
            if (mountedRef.current) {
              setPartnerLiveTranslation(translatedLive);
              console.log(
                `[Live] Translation: "${translatedLive.slice(0, 30)}..."`,
              );
            }
          } else {
            setPartnerLiveTranslation("");
          }

          // Auto-clear after 5s
          if (liveTextTimeoutRef.current) {
            clearTimeout(liveTextTimeoutRef.current);
          }
          liveTextTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setPartnerLiveText("");
              setPartnerLiveTranslation("");
            }
          }, 5000);
        }

        // ═══════════════════════════════════════════════════════════════════
        // EMOJI REACTION FROM PARTNER
        // ═══════════════════════════════════════════════════════════════════
        if (msg.type === "emoji") {
          const messageId = String(data.messageId || "");
          const emoji = String(data.emoji || "");
          setTranscript((prev) =>
            prev.map((entry) =>
              entry.id === messageId ? { ...entry, emoji } : entry,
            ),
          );
          vibrate([20, 10, 20, 10, 50]);
        }

        // ═══════════════════════════════════════════════════════════════════
        // CLEAR REQUEST FROM PARTNER
        // ═══════════════════════════════════════════════════════════════════
        if (msg.type === "clear") {
          setTranscript([]);
          vibrate([30, 20, 30]);
        }
      },

      onPartnerConnected: (name) => {
        if (!mountedRef.current) return;
        setPartnerName(name);
        vibrate([100, 50, 100]);
      },

      onPartnerDisconnected: () => {
        if (!mountedRef.current) return;
        setPartnerName("");
        setPartnerLang(null);
        setPartnerLiveText("");
        setPartnerLiveTranslation("");
      },
    });

    connectionRef.current = connection;
    connection.initialize(roomId, isHost, userName);

    return () => {
      mountedRef.current = false;
      initRef.current = false;
      connection.disconnect();

      // Cleanup timers
      [
        liveTextTimeoutRef,
        silenceTimeoutRef,
        liveTextDebounceRef,
        myCaptionTimeoutRef,
      ].forEach((ref) => {
        if (ref.current) {
          clearTimeout(ref.current);
          ref.current = null;
        }
      });

      // Cleanup speech recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore cleanup errors
        }
        recognitionRef.current = null;
      }

      // Cancel any ongoing vibration (fixes Android infinite vibration bug)
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(0);
      }
    };
  }, [
    roomId,
    isHost,
    userName,
    userLang,
    defaultTargetLang,
    translate,
    vibrate,
    addToTranscript,
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION
  // ═══════════════════════════════════════════════════════════════════════════

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI: SpeechRecognitionConstructor | undefined =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionAPI) {
      alert("Speech recognition not supported. Please use Chrome or Safari.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechCode(userLang);

    let finalizedText = "";
    let lastSpeechTime = Date.now();

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      if (!mountedRef.current) return;

      // Get current target language (partner's language or fallback)
      const targetLang = partnerLangRef.current || defaultTargetLang;

      let interim = "";
      let newFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          newFinal += text;
        } else {
          interim = text;
        }
      }

      lastSpeechTime = Date.now();
      const displayText = finalizedText + newFinal + interim;
      setMyLiveText(displayText);

      // Stream live text to partner (debounced)
      if (displayText.trim()) {
        if (liveTextDebounceRef.current) {
          clearTimeout(liveTextDebounceRef.current);
        }
        liveTextDebounceRef.current = setTimeout(async () => {
          if (!mountedRef.current) return;

          // Get fresh target language (may have updated)
          const currentTargetLang = partnerLangRef.current || defaultTargetLang;

          console.log(
            `[MyLive] "${displayText.slice(0, 20)}..." (${userLang}) → preview in ${currentTargetLang}`,
          );

          // Translate for our own preview (shows what partner will see)
          const translated = await translate(
            displayText.trim(),
            userLang,
            currentTargetLang,
          );
          if (!mountedRef.current) return;

          setMyLiveTranslation(translated);

          // Send original text + source language to partner
          sendToPartner({
            type: "live",
            data: {
              text: displayText.trim(),
              sourceLang: userLang,
            } as LiveTextPayload,
          });
        }, 150);
      }

      // Handle finalized segments
      if (newFinal.trim()) {
        finalizedText += newFinal;
        vibrate(30);

        // Get fresh target language
        const currentTargetLang = partnerLangRef.current || defaultTargetLang;

        console.log(
          `[MyFinal] "${finalizedText.slice(0, 20)}..." (${userLang}) → ${currentTargetLang}`,
        );

        const translated = await translate(
          finalizedText.trim(),
          userLang,
          currentTargetLang,
        );
        if (!mountedRef.current) return;
        setMyLiveTranslation(translated);

        // Update partner
        sendToPartner({
          type: "live",
          data: {
            text: finalizedText.trim(),
            sourceLang: userLang,
          } as LiveTextPayload,
        });

        // Hands-free mode: auto-send after silence
        if (isHandsFreeRef.current) {
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
          }
          silenceTimeoutRef.current = setTimeout(async () => {
            if (!mountedRef.current) return;
            if (finalizedText.trim() && Date.now() - lastSpeechTime > 1500) {
              const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

              // Get fresh target language for transcript
              const transcriptTargetLang =
                partnerLangRef.current || defaultTargetLang;
              const transcriptTranslated = await translate(
                finalizedText.trim(),
                userLang,
                transcriptTargetLang,
              );

              addToTranscript({
                id: messageId,
                speaker: "me",
                name: userName,
                original: finalizedText.trim(),
                translated: transcriptTranslated,
                timestamp: new Date(),
                sourceLang: userLang,
              });

              sendToPartner({
                type: "message",
                data: {
                  id: messageId,
                  speaker: userName,
                  original: finalizedText.trim(),
                  sourceLang: userLang,
                  timestamp: Date.now(),
                } as MessagePayload,
              });

              finalizedText = "";
              setMyLiveText("");
              setMyLiveTranslation("");
            }
          }, 1800);
        }
      }

      // Manual mode: send each final segment immediately
      if (!isHandsFreeRef.current && newFinal.trim()) {
        // Get fresh target language
        const currentTargetLang = partnerLangRef.current || defaultTargetLang;

        console.log(
          `[MySend] "${newFinal.slice(0, 20)}..." (${userLang}) → ${currentTargetLang}`,
        );

        const translated = await translate(
          newFinal.trim(),
          userLang,
          currentTargetLang,
        );
        if (!mountedRef.current) return;

        const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

        addToTranscript({
          id: messageId,
          speaker: "me",
          name: userName,
          original: newFinal.trim(),
          translated: translated,
          timestamp: new Date(),
          sourceLang: userLang,
        });

        sendToPartner({
          type: "message",
          data: {
            id: messageId,
            speaker: userName,
            original: newFinal.trim(),
            sourceLang: userLang,
            timestamp: Date.now(),
          } as MessagePayload,
        });

        // Clear after visual feedback
        if (myCaptionTimeoutRef.current) {
          clearTimeout(myCaptionTimeoutRef.current);
        }
        myCaptionTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            finalizedText = "";
            setMyLiveText("");
            setMyLiveTranslation("");
          }
        }, 2000);
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech recognition error:", e.error);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && mountedRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore restart errors
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    vibrate([50, 30, 50]);
  }, [
    userLang,
    defaultTargetLang,
    translate,
    vibrate,
    sendToPartner,
    addToTranscript,
    userName,
  ]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }
    vibrate(30);
  }, [vibrate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EMOJI REACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const addEmoji = useCallback(
    (messageId: string, emoji: string) => {
      setTranscript((prev) =>
        prev.map((entry) =>
          entry.id === messageId ? { ...entry, emoji } : entry,
        ),
      );
      setShowEmojiPicker(null);
      vibrate([20, 10, 20, 10, 50]);

      sendToPartner({
        type: "emoji",
        data: { messageId, emoji },
      });
    },
    [vibrate, sendToPartner],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const toggleHandsFree = useCallback(() => {
    const newValue = !isHandsFree;
    setIsHandsFree(newValue);
    vibrate(newValue ? [50, 30, 50, 30, 50] : 50);
    if (newValue && !isListening) {
      startListening();
    }
  }, [isHandsFree, isListening, startListening, vibrate]);

  const copyJoinLink = useCallback(() => {
    // Normalize room ID to uppercase for consistency
    const normalizedId = roomId.toUpperCase();
    navigator.clipboard.writeText(
      `${window.location.origin}/?join=talk&id=${normalizedId}`,
    );
    setCopied(true);
    vibrate(50);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId, vibrate]);

  const endSession = useCallback(() => {
    stopListening();
    connectionRef.current?.disconnect();
    router.push("/");
  }, [stopListening, router]);

  const speak = useCallback((text: string, lang: string) => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechCode(lang);
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }, []);

  const clearHistory = useCallback(() => {
    setTranscript([]);
    vibrate([30, 20, 30]);
    sendToPartner({ type: "clear", data: {} });
  }, [vibrate, sendToPartner]);

  // Derived display values
  const displayTargetLang = partnerLang || defaultTargetLang;
  const statusColor = isRoomFull
    ? "bg-red-500"
    : isConnected && partnerName
      ? "bg-green-500"
      : "bg-yellow-500 animate-pulse";
  const displayPartnerLang = partnerLang || defaultTargetLang;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // Browser unsupported check
  if (!browserSupport.isSupported) {
    return (
      <BrowserUnsupportedScreen
        missingFeatures={browserSupport.missingFeatures}
      />
    );
  }

  // Reconnecting overlay
  if (isReconnecting) {
    return (
      <ReconnectingOverlay
        attempt={reconnectAttempt}
        maxAttempts={5}
        onCancel={() => {
          setIsReconnecting(false);
          router.push("/");
        }}
      />
    );
  }

  // Error screen for connection failures
  if (error && !isConnected) {
    const errorType = detectErrorType(error);
    if (errorType === "permission_denied") {
      return (
        <PermissionDeniedScreen
          permissionType="microphone"
          onRetry={() => window.location.reload()}
          onBack={() => router.push("/")}
        />
      );
    }
    return (
      <ConnectionFailedScreen
        message={error}
        onRetry={() => window.location.reload()}
        onBack={() => router.push("/")}
      />
    );
  }

  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <span className="text-white text-sm font-medium">Voxxo Talk</span>
            <span className="text-gray-500 text-xs font-mono">
              #{roomId.toUpperCase()}
            </span>
          </div>

          {partnerName && (
            <div className="flex items-center gap-2 bg-purple-500/20 px-3 py-1.5">
              <span className="text-purple-400 text-sm">{partnerName}</span>
              <span className="text-purple-400/50 text-xs">
                {getFlag(displayPartnerLang)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyJoinLink}
            className="bg-white/5 px-3 py-1.5 text-cyan-400 text-sm"
          >
            {copied ? "✓ Copied" : "🔗 Share"}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`bg-white/5 px-3 py-1.5 text-sm ${showSettings ? "text-cyan-400" : "text-white"}`}
          >
            ⚙️
          </button>

          <button
            onClick={toggleHandsFree}
            className={`px-3 py-1.5 text-sm font-medium ${
              isHandsFree
                ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-white/5 text-gray-400"
            }`}
          >
            {isHandsFree ? "🎙️ Auto" : "👆 Tap"}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-black/90 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center gap-4">
          <span className="text-white text-sm">Caption Size:</span>
          <div className="flex gap-2">
            {(["small", "medium", "large"] as const).map((size) => (
              <button
                key={size}
                onClick={() => setFontSize(size)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  fontSize === size
                    ? "bg-cyan-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={clearHistory}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 text-sm"
          >
            🗑️ Clear
          </button>
        </div>
      )}

      {/* Language indicator */}
      <div className="bg-white/5 px-4 py-2 flex items-center justify-center gap-3 flex-shrink-0">
        <span className="text-xl">{getFlag(userLang)}</span>
        <span className="text-white font-medium">{userName}</span>
        <span className="text-gray-500">→</span>
        <span className="text-xl">{getFlag(displayTargetLang)}</span>
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Transcript history */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          onClick={() => setShowEmojiPicker(null)}
        >
          {isRoomFull ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🚫</div>
                <p className="text-red-400 text-xl mb-2">Room Full</p>
                <p className="text-gray-400 text-base mb-6">
                  This room is full. Only 2 participants allowed.
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="px-6 py-3 bg-cyan-500 text-white font-medium"
                >
                  Go Back Home
                </button>
              </div>
            </div>
          ) : transcript.length === 0 && !myLiveText && !partnerLiveText ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="text-center py-12">
                <div className="text-6xl mb-4">💬</div>
                <p className="text-gray-400 text-lg mb-2">
                  {isHandsFree
                    ? "Just start speaking!"
                    : "Tap the microphone to speak"}
                </p>
                <p className="text-gray-500 text-sm">
                  Your words translate instantly
                </p>
                {!isConnected && (
                  <p className="text-yellow-400 text-sm mt-4">
                    {connectionStatus}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={`max-w-[85%] md:max-w-[75%] ${entry.speaker === "me" ? "ml-auto" : "mr-auto"}`}
            >
              <div
                className={`relative p-4 ${
                  entry.speaker === "me"
                    ? "bg-cyan-500/10 border border-cyan-500/30"
                    : "bg-purple-500/10 border border-purple-500/30"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmojiPicker(
                    showEmojiPicker === entry.id ? null : entry.id,
                  );
                }}
              >
                {entry.emoji && (
                  <div className="absolute -top-3 -right-2 text-2xl animate-bounce">
                    {entry.emoji}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-medium ${entry.speaker === "me" ? "text-cyan-400" : "text-purple-400"}`}
                  >
                    {entry.name}
                  </span>
                  <span className="text-gray-600 text-xs">
                    {entry.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-xs">{getFlag(entry.sourceLang)}</span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed`}
                  >
                    {entry.original}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speak(entry.original, entry.sourceLang);
                    }}
                    className="text-gray-500 hover:text-white shrink-0"
                  >
                    🔊
                  </button>
                </div>

                <div className="mt-2 pt-2 border-t border-white/10 flex items-start justify-between gap-3">
                  <p
                    className={`${entry.speaker === "me" ? "text-cyan-300" : "text-purple-300"} ${fontSizeClasses[fontSize]}`}
                  >
                    → {entry.translated}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Translated text is in the opposite language:
                      // - My messages: translated to partner's language
                      // - Partner messages: translated to my language
                      const translatedLang =
                        entry.speaker === "me" ? displayPartnerLang : userLang;
                      speak(entry.translated, translatedLang);
                    }}
                    className="text-gray-500 hover:text-white shrink-0"
                  >
                    🔊
                  </button>
                </div>

                {/* Emoji picker */}
                {showEmojiPicker === entry.id && (
                  <div
                    className="absolute bottom-full left-0 right-0 mb-2 bg-black/90 backdrop-blur-xl p-3 border border-white/10 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap justify-center gap-2">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => addEmoji(entry.id, emoji)}
                          className="text-2xl hover:scale-125 transition-transform p-1"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={historyEndRef} />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* LIVE CAPTIONS - Floating at bottom */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="absolute bottom-0 inset-x-0 p-4 space-y-3 pointer-events-none bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/80 to-transparent pt-12">
          {/* Partner's live caption */}
          {partnerLiveText && (
            <div className="flex justify-start animate-fade-in pointer-events-auto">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-purple-500/20 backdrop-blur-xl border border-purple-500/30 border-dashed px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-purple-400 text-xs font-medium">
                      {partnerName || "Partner"}
                    </span>
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-purple-500 text-xs">speaking...</span>
                  </div>
                  <p
                    className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed`}
                  >
                    {partnerLiveText}
                  </p>
                  {partnerLiveTranslation && (
                    <p
                      className={`text-purple-300 ${fontSizeClasses[fontSize]} mt-2`}
                    >
                      → {partnerLiveTranslation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* My live caption */}
          {myLiveText && (
            <div className="flex justify-end animate-fade-in pointer-events-auto">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 border-dashed px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-cyan-400 text-xs font-medium">
                      You
                    </span>
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                  <p
                    className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed`}
                  >
                    {myLiveText}
                    <span className="inline-block w-0.5 h-4 bg-white ml-1 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p
                      className={`text-cyan-300 ${fontSizeClasses[fontSize]} mt-2`}
                    >
                      → {myLiveTranslation}
                    </p>
                  )}
                  <p className="text-gray-500 text-xs mt-2">
                    {isHandsFree
                      ? "Pause to send automatically"
                      : "Speaking..."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 py-4 flex-shrink-0">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={endSession}
            className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-all"
          >
            ✕
          </button>

          <button
            onClick={toggleHandsFree}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isHandsFree
                ? "bg-green-500/30 text-green-400 border-2 border-green-500"
                : "bg-white/10 text-gray-400"
            }`}
          >
            {isHandsFree ? "🙌" : "👆"}
          </button>

          {/* Main mic button */}
          <button
            onClick={toggleListening}
            disabled={isRoomFull || (!isConnected && !isHost)}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isRoomFull || (!isConnected && !isHost)
                ? "bg-gray-700 text-gray-500"
                : isListening
                  ? "bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/50"
                  : "bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/50"
            }`}
          >
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-20" />
                <span className="absolute inset-[-4px] rounded-full border-2 border-green-400 animate-pulse opacity-50" />
              </>
            )}
            {isListening ? (
              <div className="flex items-center gap-1 z-10">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full animate-soundwave"
                    style={{
                      height: `${14 + Math.sin(i * 0.8) * 10}px`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z" />
              </svg>
            )}
          </button>

          <button
            onClick={() =>
              transcript.length > 0 &&
              setShowEmojiPicker(transcript[transcript.length - 1]?.id)
            }
            disabled={transcript.length === 0}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              transcript.length > 0
                ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                : "bg-white/5 text-gray-600"
            }`}
          >
            😊
          </button>

          <button
            onClick={clearHistory}
            className="w-14 h-14 rounded-full bg-white/10 text-gray-400 flex items-center justify-center hover:bg-white/20 transition-all"
          >
            🗑️
          </button>
        </div>

        <p className="text-center text-sm mt-3 text-gray-400">
          {isRoomFull ? (
            <span className="text-red-400">Room is full - cannot join</span>
          ) : !isConnected && !isHost ? (
            connectionStatus
          ) : isListening ? (
            <span className="text-green-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {isHandsFree ? "Hands-free • Speak naturally" : "Listening..."}
            </span>
          ) : (
            "Tap the mic to speak"
          )}
        </p>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
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
      `}</style>
    </div>
  );
}

export default function TalkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TalkContent />
    </Suspense>
  );
}
