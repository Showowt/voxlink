"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCamera, stopCamera } from "../lib/peer-connection";
import { getFlag, LANGUAGES } from "../lib/languages";
import { LanguageSelector } from "./LanguageSelector";

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-CALL LOBBY - Camera preview, mic test, and settings before joining
// ═══════════════════════════════════════════════════════════════════════════════

interface PreCallLobbyProps {
  roomCode: string;
  userName: string;
  userLang: string;
  isHost: boolean;
  onJoin: (settings: {
    stream: MediaStream;
    userLang: string;
    partnerLang: string;
    videoEnabled: boolean;
    cyranoEnabled: boolean;
  }) => void;
  onBack: () => void;
}

type PermissionStatus = "checking" | "granted" | "denied" | "error";

export default function PreCallLobby({
  roomCode,
  userName,
  userLang: initialUserLang,
  isHost,
  onJoin,
  onBack,
}: PreCallLobbyProps) {
  const router = useRouter();

  // Device state
  const [cameraPermission, setCameraPermission] =
    useState<PermissionStatus>("checking");
  const [micPermission, setMicPermission] =
    useState<PermissionStatus>("checking");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Settings state
  const [userLang, setUserLang] = useState(initialUserLang);
  const [partnerLang, setPartnerLang] = useState(
    initialUserLang === "en" ? "es" : "en",
  );
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [cyranoEnabled, setCyranoEnabled] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamHandedOffRef = useRef(false); // Track if stream was passed to parent

  // Initialize camera and mic
  useEffect(() => {
    let localStream: MediaStream | null = null;
    let mounted = true;

    const initDevices = async () => {
      try {
        setCameraPermission("checking");
        setMicPermission("checking");

        // Request camera and microphone
        localStream = await getCamera("user");

        if (!mounted) {
          stopCamera(localStream);
          return;
        }

        setStream(localStream);

        // Check camera
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
          setCameraPermission("granted");
          if (videoRef.current) {
            videoRef.current.srcObject = localStream;
          }
        } else {
          setCameraPermission("denied");
        }

        // Check mic
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
          setMicPermission("granted");
          startMicLevelMonitor(localStream);
        } else {
          setMicPermission("denied");
        }
      } catch (err) {
        console.error("Device access error:", err);
        if (!mounted) return;

        const errorMsg =
          err instanceof Error ? err.message : "Failed to access devices";

        if (errorMsg.includes("denied") || errorMsg.includes("NotAllowed")) {
          setCameraPermission("denied");
          setMicPermission("denied");
          setError(
            "Camera/microphone access denied. Please allow access in your browser settings.",
          );
        } else if (errorMsg.includes("NotFound")) {
          setCameraPermission("error");
          setMicPermission("error");
          setError("No camera or microphone found on this device.");
        } else {
          setCameraPermission("error");
          setMicPermission("error");
          setError(errorMsg);
        }
      }
    };

    initDevices();

    return () => {
      mounted = false;
      // Only stop stream if NOT handed off to parent (user joined call)
      if (localStream && !streamHandedOffRef.current) {
        stopCamera(localStream);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Mic level monitoring
  const startMicLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      // Close existing context to prevent duplicates
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext; // Store IMMEDIATELY to prevent race condition

      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      source.connect(analyser);

      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current || !audioContextRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const normalizedLevel = Math.min(100, (average / 128) * 100);
        setMicLevel(normalizedLevel);

        animationRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.error("Mic monitor error:", err);
    }
  }, []);

  // Toggle video preview
  const toggleVideoPreview = useCallback(() => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  }, [stream]);

  // Join call
  const handleJoin = useCallback(
    (withVideo: boolean) => {
      if (!stream) {
        setError("No media stream available");
        return;
      }

      // Set video state based on join option
      if (!withVideo) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
        }
      }

      // Mark stream as handed off - don't cleanup on unmount
      streamHandedOffRef.current = true;

      onJoin({
        stream,
        userLang,
        partnerLang,
        videoEnabled: withVideo,
        cyranoEnabled,
      });
    },
    [stream, userLang, partnerLang, cyranoEnabled, onJoin],
  );

  // Permission status icon
  const getPermissionIcon = (status: PermissionStatus) => {
    switch (status) {
      case "checking":
        return (
          <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        );
      case "granted":
        return <span className="text-green-400">✓</span>;
      case "denied":
        return <span className="text-red-400">✕</span>;
      case "error":
        return <span className="text-orange-400">⚠</span>;
    }
  };

  // Can join?
  const canJoin =
    stream && (cameraPermission === "granted" || micPermission === "granted");

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
          {/* Header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {isHost ? "Start Video Call" : "Join Video Call"}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  Room:{" "}
                  <span className="font-mono text-[#00C896]">{roomCode}</span>
                </p>
              </div>
              <button
                onClick={onBack}
                className="p-3 text-gray-400 hover:text-white transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close and go back"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Camera Preview */}
          <div className="relative aspect-video bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${
                !videoEnabled ? "hidden" : ""
              }`}
            />
            {!videoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center">
                  <span className="text-5xl">📵</span>
                  <p className="text-gray-400 mt-2">Camera Off</p>
                </div>
              </div>
            )}

            {/* Camera toggle button */}
            <button
              onClick={toggleVideoPreview}
              aria-label={videoEnabled ? "Turn camera off" : "Turn camera on"}
              className={`absolute bottom-3 right-3 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition ${
                videoEnabled
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
            >
              {videoEnabled ? "📹" : "📵"}
            </button>

            {/* Name badge */}
            <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-lg">
              <span className="text-white text-sm">{userName}</span>
            </div>
          </div>

          {/* Device Status */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            {/* Error message */}
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Camera status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📹</span>
                <span className="text-white">Camera</span>
              </div>
              <div className="flex items-center gap-2">
                {getPermissionIcon(cameraPermission)}
                <span className="text-sm text-gray-400">
                  {cameraPermission === "granted"
                    ? "Ready"
                    : cameraPermission === "checking"
                      ? "Checking..."
                      : cameraPermission === "denied"
                        ? "Denied"
                        : "Error"}
                </span>
              </div>
            </div>

            {/* Mic status with level */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎤</span>
                <span className="text-white">Microphone</span>
              </div>
              <div className="flex items-center gap-2">
                {micPermission === "granted" ? (
                  <>
                    {/* Mic level bar */}
                    <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00C896] transition-all duration-75"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                    <span className="text-green-400">✓</span>
                  </>
                ) : (
                  <>
                    {getPermissionIcon(micPermission)}
                    <span className="text-sm text-gray-400">
                      {micPermission === "checking"
                        ? "Checking..."
                        : micPermission === "denied"
                          ? "Denied"
                          : "Error"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Language Settings */}
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                <span>🗣️</span> You speak
              </label>
              <LanguageSelector
                value={userLang}
                onChange={setUserLang}
                excludeCode={partnerLang}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                <span>👤</span> Partner speaks
              </label>
              <LanguageSelector
                value={partnerLang}
                onChange={setPartnerLang}
                excludeCode={userLang}
              />
            </div>

            {/* Language preview */}
            <div className="p-3 rounded-xl bg-gradient-to-r from-[#00C896]/10 to-[#0066FF]/10 border border-white/10">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <span className="text-2xl">{getFlag(userLang)}</span>
                  <p className="text-xs text-gray-400 mt-1">You</p>
                </div>
                <span className="text-xl text-white/50">↔</span>
                <div className="text-center">
                  <span className="text-2xl">{getFlag(partnerLang)}</span>
                  <p className="text-xs text-gray-400 mt-1">Partner</p>
                </div>
              </div>
            </div>

            {/* Cyrano Mode Toggle */}
            <button
              onClick={() => setCyranoEnabled(!cyranoEnabled)}
              className={`w-full p-4 rounded-xl border transition-all ${
                cyranoEnabled
                  ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50"
                  : "bg-[#1a1a2e] border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎭</span>
                  <div className="text-left">
                    <p
                      className={`font-medium ${cyranoEnabled ? "text-amber-400" : "text-white"}`}
                    >
                      Cyrano Mode
                    </p>
                    <p className="text-xs text-gray-400">
                      AI coaching with real-time suggestions
                    </p>
                  </div>
                </div>
                <div
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${
                    cyranoEnabled ? "bg-amber-500" : "bg-gray-600"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                      cyranoEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>
              {cyranoEnabled && (
                <p className="mt-3 text-xs text-amber-400/80 text-left pl-9">
                  ⚡ Get Bold, Warm, and Safe response suggestions during your
                  call
                </p>
              )}
            </button>
          </div>

          {/* Join Buttons */}
          <div className="p-4 pt-0 space-y-3">
            <button
              onClick={() => handleJoin(true)}
              disabled={!canJoin}
              className={`w-full py-4 rounded-xl font-semibold text-lg transition shadow-lg ${
                canJoin
                  ? "bg-gradient-to-r from-[#00C896] to-[#0066FF] hover:from-[#00B085] hover:to-[#0055DD] text-white shadow-[#00C896]/25"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              🎥 Join with Video
            </button>

            <button
              onClick={() => handleJoin(false)}
              disabled={!canJoin}
              className={`w-full py-3 rounded-xl font-medium text-base transition ${
                canJoin
                  ? "bg-[#1a1a2e] border border-gray-700 text-white hover:border-gray-600"
                  : "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
              }`}
            >
              🎤 Join Audio Only
            </button>

            <button
              onClick={onBack}
              className="w-full py-3 text-gray-400 hover:text-white transition text-sm min-h-[44px]"
              aria-label="Go back to home"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
