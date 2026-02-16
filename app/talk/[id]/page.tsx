"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { TalkConnection, TalkMessage } from "../../lib/talk-connection";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK TALK MODE - World's First Live Translation Chat
// Beautiful flowing captions with conversation history
// ═══════════════════════════════════════════════════════════════════════════════

interface TranscriptEntry {
  id: string;
  speaker: "me" | "partner";
  name: string;
  original: string;
  translated: string;
  timestamp: Date;
  lang: "en" | "es";
  emoji?: string;
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
  const roomId = params.id as string;

  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") || "User";
  const userLang = (searchParams.get("lang") || "en") as "en" | "es";
  const targetLang = userLang === "en" ? "es" : "en";

  // Connection state
  const [connectionStatus, setConnectionStatus] =
    useState<string>("Connecting...");
  const [isConnected, setIsConnected] = useState(false);
  const [partnerName, setPartnerName] = useState("");

  // Speech state
  const [isListening, setIsListening] = useState(false);
  const [isHandsFree, setIsHandsFree] = useState(false);

  // Live caption state
  const [myLiveText, setMyLiveText] = useState("");
  const [myLiveTranslation, setMyLiveTranslation] = useState("");
  const [partnerLiveText, setPartnerLiveText] = useState("");
  const [partnerLiveTranslation, setPartnerLiveTranslation] = useState("");

  // Transcript
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [showHistory, setShowHistory] = useState(true);

  // Settings
  const [fontSize, setFontSize] = useState<"small" | "medium" | "large">(
    "medium",
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);

  // UI
  const [copied, setCopied] = useState(false);

  // Refs
  const connectionRef = useRef<TalkConnection | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isHandsFreeRef = useRef(false);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const liveTextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const liveTextDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const myCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Font size classes
  const fontSizeClasses = {
    small: "text-sm",
    medium: "text-base",
    large: "text-xl",
  };

  // Keep refs in sync
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  useEffect(() => {
    isHandsFreeRef.current = isHandsFree;
  }, [isHandsFree]);

  // Auto-scroll history
  useEffect(() => {
    if (showHistory && historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, showHistory]);

  // Haptic feedback
  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  const translate = useCallback(
    async (text: string, from: string, to: string): Promise<string> => {
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
        });
        if (!res.ok) throw new Error("Translation failed");
        const data = await res.json();
        return data.translation || text;
      } catch {
        return text;
      }
    },
    [],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const addToTranscript = useCallback(
    (
      speaker: "me" | "partner",
      name: string,
      original: string,
      translated: string,
      lang: "en" | "es",
    ) => {
      if (!original.trim()) return;

      const entry: TranscriptEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        speaker,
        name,
        original: original.trim(),
        translated: translated.trim(),
        timestamp: new Date(),
        lang,
      };

      setTranscript((prev) => [...prev, entry]);
      vibrate(speaker === "partner" ? 100 : [30, 20, 30]);
    },
    [vibrate],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PEERJS CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const connection = new TalkConnection({
      onStatusChange: (status, message) => {
        setConnectionStatus(message || status);
        setIsConnected(status === "connected");
      },
      onMessage: (msg: TalkMessage) => {
        if (msg.type === "message") {
          // Complete message from partner
          addToTranscript(
            "partner",
            msg.data.speaker,
            msg.data.original,
            msg.data.translation,
            msg.data.lang,
          );
          // Clear partner live text
          setPartnerLiveText("");
          setPartnerLiveTranslation("");
        }

        if (msg.type === "live") {
          // Real-time streaming from partner
          setPartnerLiveText(msg.data.text || "");
          setPartnerLiveTranslation(msg.data.translation || "");

          // Auto-clear after 5s of no updates
          if (liveTextTimeoutRef.current)
            clearTimeout(liveTextTimeoutRef.current);
          liveTextTimeoutRef.current = setTimeout(() => {
            setPartnerLiveText("");
            setPartnerLiveTranslation("");
          }, 5000);
        }

        if (msg.type === "emoji") {
          // Partner added emoji to a message
          setTranscript((h) =>
            h.map((m) =>
              m.id === msg.data.messageId ? { ...m, emoji: msg.data.emoji } : m,
            ),
          );
          vibrate([20, 10, 20, 10, 50]);
        }

        if (msg.type === "clear") {
          setTranscript([]);
          vibrate([30, 20, 30]);
        }
      },
      onPartnerConnected: (name) => {
        setPartnerName(name);
        vibrate([100, 50, 100]);
      },
      onPartnerDisconnected: () => {
        setPartnerName("");
        setPartnerLiveText("");
        setPartnerLiveTranslation("");
      },
    });

    connectionRef.current = connection;
    connection.initialize(roomId, isHost, userName);

    return () => {
      mountedRef.current = false;
      connection.disconnect();
      if (liveTextTimeoutRef.current) clearTimeout(liveTextTimeoutRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (liveTextDebounceRef.current)
        clearTimeout(liveTextDebounceRef.current);
      if (myCaptionTimeoutRef.current)
        clearTimeout(myCaptionTimeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [roomId, isHost, userName, vibrate, addToTranscript]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SEND TO PARTNER
  // ═══════════════════════════════════════════════════════════════════════════

  const sendToPartner = useCallback((message: TalkMessage) => {
    // Always try to send - TalkConnection handles queuing if not connected
    if (connectionRef.current) {
      connectionRef.current.send(message);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION
  // ═══════════════════════════════════════════════════════════════════════════

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = userLang === "en" ? "en-US" : "es-ES";

    let finalizedText = "";
    let lastSpeechTime = Date.now();

    recognition.onresult = async (event: any) => {
      if (!mountedRef.current) return;

      let interim = "";
      let newFinal = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinal += transcript;
        } else {
          interim = transcript;
        }
      }

      lastSpeechTime = Date.now();
      const displayText = finalizedText + newFinal + interim;
      setMyLiveText(displayText);

      // Stream live text to partner (debounced)
      if (displayText.trim()) {
        if (liveTextDebounceRef.current)
          clearTimeout(liveTextDebounceRef.current);
        liveTextDebounceRef.current = setTimeout(async () => {
          if (!mountedRef.current) return;
          const translated = await translate(
            displayText.trim(),
            userLang,
            targetLang,
          );
          if (!mountedRef.current) return;
          setMyLiveTranslation(translated);
          sendToPartner({
            type: "live",
            data: { text: displayText.trim(), translation: translated },
          });
        }, 150);
      }

      if (newFinal.trim()) {
        finalizedText += newFinal;
        vibrate(30);

        const translated = await translate(
          finalizedText.trim(),
          userLang,
          targetLang,
        );
        setMyLiveTranslation(translated);

        // Stream updated text
        sendToPartner({
          type: "live",
          data: { text: finalizedText.trim(), translation: translated },
        });

        // In hands-free mode, auto-send after silence
        if (isHandsFreeRef.current) {
          if (silenceTimeoutRef.current)
            clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = setTimeout(async () => {
            if (finalizedText.trim() && Date.now() - lastSpeechTime > 1500) {
              // Add to transcript
              addToTranscript(
                "me",
                userName,
                finalizedText.trim(),
                translated,
                userLang,
              );
              // Send to partner
              sendToPartner({
                type: "message",
                data: {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  speaker: userName,
                  original: finalizedText.trim(),
                  translation: translated,
                  lang: userLang,
                  timestamp: Date.now(),
                },
              });
              // Clear
              finalizedText = "";
              setMyLiveText("");
              setMyLiveTranslation("");
            }
          }, 1800);
        }
      }

      // Manual mode: send on final result
      if (!isHandsFreeRef.current && newFinal.trim()) {
        const translated = await translate(
          newFinal.trim(),
          userLang,
          targetLang,
        );
        // Add to transcript
        addToTranscript("me", userName, newFinal.trim(), translated, userLang);
        // Send to partner
        sendToPartner({
          type: "message",
          data: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            speaker: userName,
            original: newFinal.trim(),
            translation: translated,
            lang: userLang,
            timestamp: Date.now(),
          },
        });
        // Clear after short delay
        if (myCaptionTimeoutRef.current)
          clearTimeout(myCaptionTimeoutRef.current);
        myCaptionTimeoutRef.current = setTimeout(() => {
          finalizedText = "";
          setMyLiveText("");
          setMyLiveTranslation("");
        }, 2000);
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech error:", e.error);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && mountedRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    vibrate([50, 30, 50]);
  }, [
    userLang,
    targetLang,
    translate,
    vibrate,
    sendToPartner,
    addToTranscript,
    userName,
  ]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    vibrate(30);
  }, [vibrate]);

  // ═══════════════════════════════════════════════════════════════════════════
  // EMOJI REACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const addEmoji = useCallback(
    (messageId: string, emoji: string) => {
      setTranscript((h) =>
        h.map((msg) => (msg.id === messageId ? { ...msg, emoji } : msg)),
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
  // CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const toggleHandsFree = () => {
    const newValue = !isHandsFree;
    setIsHandsFree(newValue);
    vibrate(newValue ? [50, 30, 50, 30, 50] : 50);
    if (newValue && !isListening) startListening();
  };

  const copyJoinLink = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}/?join=talk&id=${roomId}`,
    );
    setCopied(true);
    vibrate(50);
    setTimeout(() => setCopied(false), 2000);
  };

  const endSession = () => {
    stopListening();
    connectionRef.current?.disconnect();
    router.push("/");
  };

  const speak = (text: string, lang: "en" | "es") => {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "en" ? "en-US" : "es-ES";
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  };

  const clearHistory = () => {
    setTranscript([]);
    vibrate([30, 20, 30]);
    sendToPartner({ type: "clear", data: {} });
  };

  const statusColor =
    isConnected && partnerName ? "bg-green-500" : "bg-yellow-500 animate-pulse";

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-screen bg-[#0a0a0f] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <span className="text-white text-sm font-medium">VoxLink Talk</span>
            <span className="text-gray-500 text-xs font-mono">#{roomId}</span>
          </div>

          {partnerName && (
            <div className="flex items-center gap-2 bg-purple-500/20 px-3 py-1.5">
              <span className="text-purple-400 text-sm">{partnerName}</span>
              <span className="text-purple-400/50 text-xs">
                {targetLang === "en" ? "🇺🇸" : "🇪🇸"}
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
        <span className="text-xl">{userLang === "en" ? "🇺🇸" : "🇪🇸"}</span>
        <span className="text-white font-medium">{userName}</span>
        <span className="text-gray-500">→</span>
        <span className="text-xl">{targetLang === "en" ? "🇺🇸" : "🇪🇸"}</span>
      </div>

      {/* Conversation area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Transcript history */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-3"
          onClick={() => setShowEmojiPicker(null)}
        >
          {transcript.length === 0 && !myLiveText && !partnerLiveText && (
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
          )}

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
                  <span className="text-xs">
                    {entry.lang === "en" ? "🇺🇸" : "🇪🇸"}
                  </span>
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
                      speak(entry.original, entry.lang);
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
                      speak(
                        entry.translated,
                        entry.lang === "en" ? "es" : "en",
                      );
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
            disabled={!isConnected && !isHost}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              !isConnected && !isHost
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
          {!isConnected && !isHost ? (
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

      {/* Custom styles */}
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
