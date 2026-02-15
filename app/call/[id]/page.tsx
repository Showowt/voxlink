"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import {
  PeerConnection,
  getCamera,
  stopCamera,
} from "../../lib/peer-connection";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CALL - PeerJS P2P with Live Translation
// Mobile-optimized, no external API dependencies
// ═══════════════════════════════════════════════════════════════════════════════

type CallStatus = "loading" | "waiting" | "connecting" | "connected" | "error";

interface TranscriptEntry {
  id: string;
  speaker: "me" | "partner";
  name: string;
  original: string;
  translated: string;
  timestamp: Date;
  lang: "en" | "es";
}

function VideoCallContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomCode = params.id as string;
  const isHost = searchParams.get("host") === "true";
  const userName = searchParams.get("name") || "User";
  const userLang = (searchParams.get("lang") || "en") as "en" | "es";
  const targetLang = userLang === "en" ? "es" : "en";

  // State
  const [status, setStatus] = useState<CallStatus>("loading");
  const [statusMessage, setStatusMessage] = useState("Iniciando...");
  const [error, setError] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(false);
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

  // Refs
  const peerRef = useRef<PeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const mountedRef = useRef(true);
  const captionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const theirCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const isConnected = status === "connected" && hasPartner;
  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-yellow-500";

  // ═══════════════════════════════════════════════════════════════════════════
  // PEERJS SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    mountedRef.current = true;
    let localStream: MediaStream | null = null;

    const init = async () => {
      try {
        setStatus("loading");
        setStatusMessage("Getting camera...");

        // Get camera
        localStream = await getCamera("user");
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
          },
          onDataMessage: (data) => {
            if (!mountedRef.current) return;
            handleDataMessage(data);
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
            setPartnerName("");
          },
          onError: (err) => {
            if (!mountedRef.current) return;
            console.error("❌ Error:", err);
            setError(err);
            setStatus("error");
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
      } catch (err: any) {
        console.error("Init error:", err);
        if (mountedRef.current) {
          setStatus("error");
          setError(err.message || "Failed to start call");
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      stopListening();
      if (localStreamRef.current) {
        stopCamera(localStreamRef.current);
      }
      if (peerRef.current) {
        peerRef.current.disconnect();
      }
    };
  }, [roomCode, isHost, userName]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA MESSAGE HANDLING (captions from partner)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleDataMessage = useCallback(
    (data: any) => {
      if (data.type === "caption") {
        // Clear existing timeout
        if (theirCaptionTimeoutRef.current) {
          clearTimeout(theirCaptionTimeoutRef.current);
        }

        setTheirLiveText(data.text);
        setTheirLiveTranslation(data.translation || "");

        // Auto-clear after 5 seconds of no updates
        theirCaptionTimeoutRef.current = setTimeout(() => {
          setTheirLiveText("");
          setTheirLiveTranslation("");
        }, 5000);

        // If this is a final caption, add to transcript
        if (data.isFinal && data.text) {
          addToTranscript(
            "partner",
            partnerName || "Partner",
            data.text,
            data.translation || data.text,
            targetLang,
          );
        }
      }
    },
    [partnerName, targetLang],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION & TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  const translateText = async (text: string): Promise<string> => {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          sourceLang: userLang,
          targetLang: targetLang,
        }),
      });
      const data = await res.json();
      return data.translation || text;
    } catch {
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

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = userLang === "en" ? "en-US" : "es-ES";

    recognition.onstart = () => {
      setIsListening(true);
      console.log("🎤 Listening started");
    };

    recognition.onresult = async (event: any) => {
      const results = event.results;
      const latest = results[results.length - 1];
      const text = latest[0].transcript.trim();
      const isFinal = latest.isFinal;

      // Update live text
      setMyLiveText(text);

      // Translate in real-time
      const translation = await translateText(text);
      setMyLiveTranslation(translation);

      // Send to partner
      peerRef.current?.send({
        type: "caption",
        text,
        translation,
        isFinal,
        lang: userLang,
      });

      if (isFinal) {
        // Add to transcript
        addToTranscript("me", userName, text, translation, userLang);

        // Clear after delay
        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
        captionTimeoutRef.current = setTimeout(() => {
          setMyLiveText("");
          setMyLiveTranslation("");
        }, 2000);
      }
    };

    recognition.onerror = (event: any) => {
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
  }, [userLang, userName, targetLang]);

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

  const addToTranscript = (
    speaker: "me" | "partner",
    name: string,
    original: string,
    translated: string,
    lang: "en" | "es",
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
    if (localStreamRef.current) {
      stopCamera(localStreamRef.current);
    }
    if (peerRef.current) {
      peerRef.current.disconnect();
    }
    router.push("/");
  };

  const copyLink = () => {
    const url = `${window.location.origin}/call/${roomCode}?host=false&name=Guest&lang=${targetLang}`;
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

        {/* No partner overlay */}
        {!hasPartner && (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
            <div className="text-center p-6">
              {status === "error" ? (
                <>
                  <div className="text-6xl mb-4">❌</div>
                  <p className="text-red-400 text-xl mb-4">{error}</p>
                  <button
                    onClick={retry}
                    className="px-6 py-3 bg-cyan-500 text-white font-medium"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 md:w-20 md:h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                  <p className="text-white text-lg md:text-xl mb-2">
                    {statusMessage}
                  </p>
                  {isHost &&
                    (status === "waiting" || status === "connected") && (
                      <div className="mt-4 p-4 bg-white/10 backdrop-blur">
                        <p className="text-gray-400 text-sm mb-2">
                          Share this code:
                        </p>
                        <p className="text-cyan-400 text-2xl md:text-3xl font-mono font-bold tracking-wider">
                          {roomCode}
                        </p>
                        <button
                          onClick={copyLink}
                          className="mt-3 px-4 py-2 bg-cyan-500/20 text-cyan-400 text-sm min-h-[44px]"
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
              {userName} {userLang === "en" ? "🇺🇸" : "🇪🇸"}
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

          {hasPartner && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-h-[44px] ${showHistory ? "text-cyan-400" : "text-white"}`}
            >
              📜 {transcript.length > 0 && `(${transcript.length})`}
            </button>
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
                      {targetLang === "en" ? "🇺🇸" : "🇪🇸"}
                    </span>
                  </div>
                  <p className="text-white/70 text-xs md:text-sm leading-relaxed mb-1">
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
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 px-3 py-2 md:px-4 md:py-3 shadow-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-cyan-400 text-xs font-medium">
                      You
                    </span>
                    <span className="text-cyan-400/50 text-xs">
                      {userLang === "en" ? "🇺🇸" : "🇪🇸"}
                    </span>
                  </div>
                  <p className="text-white/70 text-xs md:text-sm leading-relaxed mb-1">
                    {myLiveText}
                    <span className="inline-block w-0.5 h-3 md:h-4 bg-white/70 ml-1 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p
                      className={`text-cyan-300 font-medium leading-relaxed ${
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
                    className={`p-2 md:p-3 ${entry.speaker === "me" ? "bg-cyan-500/10 border-l-2 border-cyan-500" : "bg-purple-500/10 border-l-2 border-purple-500"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-medium ${entry.speaker === "me" ? "text-cyan-400" : "text-purple-400"}`}
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

          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isConnected}
            className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all ${
              !isConnected
                ? "bg-gray-700 text-gray-500"
                : isListening
                  ? "bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/50"
                  : "bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/50"
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
      `}</style>
    </div>
  );
}

export default function VideoCallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VideoCallContent />
    </Suspense>
  );
}
