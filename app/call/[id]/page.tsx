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

  // Quality monitoring state
  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const callStartTimeRef = useRef<number | null>(null);

  // Refs
  const peerRef = useRef<PeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
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
    }) => {
      setLobbyStream(settings.stream);
      setUserLang(settings.userLang);
      setExpectedPartnerLang(settings.partnerLang);
      setIsVideoOff(!settings.videoEnabled);
      setInLobby(false);
    },
    [],
  );

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
      if (localStreamRef.current) {
        stopCamera(localStreamRef.current);
      }
      if (peerRef.current) {
        peerRef.current.disconnect();
      }
    };
  }, [roomCode, isHost, userName, inLobby, lobbyStream]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA MESSAGE HANDLING (captions from partner)
  // ═══════════════════════════════════════════════════════════════════════════

  // Type guard for CaptionData
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

  const handleDataMessage = useCallback(
    async (data: CaptionData | Record<string, unknown>) => {
      if (!isCaptionData(data)) {
        // Ignore non-caption messages (ping/pong, hello, etc.)
        return;
      }
      const captionData = data;

      // Clear existing timeout
      if (theirCaptionTimeoutRef.current) {
        clearTimeout(theirCaptionTimeoutRef.current);
      }

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
            const translation = result.translation || captionData.text;
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

      // If this is a final caption, add to transcript
      if (captionData.isFinal && captionData.text) {
        addToTranscript(
          "partner",
          partnerName || "Partner",
          captionData.text,
          captionData.translation || captionData.text,
          captionData.lang || "en",
        );
      }
    },
    [partnerName, userLang],
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
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`bg-black/50 backdrop-blur px-2 py-1.5 md:px-3 md:py-2 text-xs md:text-sm min-h-[44px] ${showHistory ? "text-[#00C896]" : "text-white"}`}
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
                      {getFlag(partnerLang || "es")}
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
                <div className="bg-[#00C896]/20 backdrop-blur-xl border border-[#00C896]/30 px-3 py-2 md:px-4 md:py-3 shadow-lg">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[#00C896] text-xs font-medium">
                      You
                    </span>
                    <span className="text-[#00C896]/50 text-xs">
                      {getFlag(userLang)}
                    </span>
                  </div>
                  <p className="text-white/70 text-xs md:text-sm leading-relaxed mb-1">
                    {myLiveText}
                    <span className="inline-block w-0.5 h-3 md:h-4 bg-white/70 ml-1 animate-blink" />
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
