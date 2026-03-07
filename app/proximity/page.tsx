"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  generateSessionId,
  getCurrentPosition,
  watchPosition,
  registerPresence,
  updatePresenceStatus,
  removePresence,
  findNearbyUsers,
  sendConnectionRequest,
  getPendingRequests,
  respondToRequest,
  subscribeToRequests,
  formatDistance,
  getLanguageFlag,
  getLanguageName,
  type NearbyUser,
  type ProximityRequest,
  type GeoPosition,
} from "../lib/proximity-client";
import { LANGUAGES } from "../lib/languages";

// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY RADAR - AirDrop-style nearby user discovery
// ═══════════════════════════════════════════════════════════════════════════════

type ProximityStatus =
  | "initializing"
  | "requesting_permission"
  | "scanning"
  | "broadcasting"
  | "error";

function ProximityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Core state
  const [status, setStatus] = useState<ProximityStatus>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [language, setLanguage] = useState("en");
  const [permissionState, setPermissionState] = useState<
    "prompt" | "granted" | "denied" | "unknown"
  >("unknown");

  // UI state
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [pendingRequest, setPendingRequest] = useState<ProximityRequest | null>(
    null,
  );
  const [incomingRequest, setIncomingRequest] =
    useState<ProximityRequest | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  // Radar animation
  const [radarAngle, setRadarAngle] = useState(0);

  // Refs
  const watchIdRef = useRef<number | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const requestPollRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Load saved language preference
  useEffect(() => {
    const savedLang = localStorage.getItem("voxlink_lang");
    if (savedLang && LANGUAGES.find((l) => l.code === savedLang)) {
      setLanguage(savedLang);
    }
  }, []);

  // Check location permission state on load
  useEffect(() => {
    const checkPermission = async () => {
      try {
        if ("permissions" in navigator) {
          const result = await navigator.permissions.query({
            name: "geolocation",
          });
          setPermissionState(result.state as "prompt" | "granted" | "denied");

          // Listen for permission changes
          result.onchange = () => {
            setPermissionState(result.state as "prompt" | "granted" | "denied");
            if (result.state === "granted" && status === "error") {
              // Permission was just granted, retry
              startProximity();
            }
          };
        }
      } catch {
        setPermissionState("unknown");
      }
    };

    checkPermission();
  }, [status]);

  // Initialize session
  useEffect(() => {
    const id = generateSessionId();
    setSessionId(id);
  }, []);

  // Radar animation
  useEffect(() => {
    if (status === "scanning" || status === "broadcasting") {
      const interval = setInterval(() => {
        setRadarAngle((prev) => (prev + 3) % 360);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Request location permission and start scanning
  const startProximity = useCallback(async () => {
    if (!sessionId) return;

    setStatus("requesting_permission");
    setError(null);

    try {
      // Get initial position
      const pos = await getCurrentPosition();
      setPosition(pos);

      // Register presence
      const result = await registerPresence(
        sessionId,
        language,
        pos.lat,
        pos.lng,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to register");
      }

      setStatus("broadcasting");

      // Watch position changes
      watchIdRef.current = watchPosition(
        async (newPos) => {
          setPosition(newPos);
          // Update presence with new position
          await registerPresence(sessionId, language, newPos.lat, newPos.lng);
        },
        (err) => {
          console.error("Position watch error:", err);
        },
      );

      // Start scanning for nearby users
      scanIntervalRef.current = setInterval(async () => {
        const nearbyResult = await findNearbyUsers(
          pos.lat,
          pos.lng,
          5000, // 5km radius
          sessionId,
        );

        if (nearbyResult.success && nearbyResult.users) {
          setNearbyUsers(nearbyResult.users);
        }
      }, 3000);

      // Scan immediately
      const initialScan = await findNearbyUsers(
        pos.lat,
        pos.lng,
        5000,
        sessionId,
      );
      if (initialScan.success && initialScan.users) {
        setNearbyUsers(initialScan.users);
      }

      // Poll for incoming requests every 2 seconds (reliable fallback)
      requestPollRef.current = setInterval(async () => {
        const requestsResult = await getPendingRequests(sessionId);
        if (
          requestsResult.success &&
          requestsResult.requests &&
          requestsResult.requests.length > 0
        ) {
          // Show the most recent pending request
          const latestRequest = requestsResult.requests[0];
          if (!incomingRequest || incomingRequest.id !== latestRequest.id) {
            setIncomingRequest(latestRequest as ProximityRequest);
          }
        }
      }, 2000);

      // Check immediately
      const initialRequests = await getPendingRequests(sessionId);
      if (
        initialRequests.success &&
        initialRequests.requests &&
        initialRequests.requests.length > 0
      ) {
        setIncomingRequest(initialRequests.requests[0] as ProximityRequest);
      }

      // Subscribe to incoming requests (Realtime - may not work on all setups)
      unsubscribeRef.current = subscribeToRequests(
        sessionId,
        (request) => {
          setIncomingRequest(request);
        },
        (roomCode) => {
          // Request was accepted! Navigate to call
          router.push(`/call/${roomCode}?host=false&lang=${language}`);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setStatus("error");
    }
  }, [sessionId, language, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
      if (requestPollRef.current) {
        clearInterval(requestPollRef.current);
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (sessionId) {
        removePresence(sessionId);
      }
    };
  }, [sessionId]);

  // Handle page visibility
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!sessionId) return;

      if (document.hidden) {
        await updatePresenceStatus(sessionId, "busy");
      } else {
        await updatePresenceStatus(sessionId, "available");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionId]);

  // Send connection request
  const handleSendRequest = useCallback(async () => {
    if (!sessionId || !selectedUser) return;

    setIsSending(true);

    const result = await sendConnectionRequest(
      sessionId,
      selectedUser.id,
      connectionMessage || undefined,
    );

    if (result.success) {
      setPendingRequest({
        id: result.requestId!,
        from_session_id: sessionId,
        to_session_id: selectedUser.session_id,
        message: connectionMessage,
        status: "pending",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      setSelectedUser(null);
      setConnectionMessage("");
    } else {
      setError(result.error || "Failed to send request");
    }

    setIsSending(false);
  }, [sessionId, selectedUser, connectionMessage]);

  // Poll for pending request status (for sender to know when accepted)
  useEffect(() => {
    if (!pendingRequest || !sessionId) return;

    const checkRequestStatus = async () => {
      try {
        const response = await fetch(
          `/api/proximity/request?sessionId=${sessionId}`,
        );
        const data = await response.json();

        // Check if our outgoing request was accepted by looking at proximity_requests
        // We need to check the request we sent
        const checkResponse = await fetch(`/api/proximity/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: pendingRequest.id,
            checkOnly: true,
            sessionId: sessionId,
          }),
        });

        // Actually, let's use a simpler approach - just poll the request status
        const statusResponse = await fetch(
          `/api/proximity/request/status?requestId=${pendingRequest.id}`,
        );

        if (!statusResponse.ok) {
          // Fallback: check via Supabase directly from client
          return;
        }

        const statusData = await statusResponse.json();
        if (statusData.status === "accepted" && statusData.roomCode) {
          setPendingRequest(null);
          router.push(
            `/call/${statusData.roomCode}?host=false&lang=${language}`,
          );
        } else if (
          statusData.status === "rejected" ||
          statusData.status === "expired"
        ) {
          setPendingRequest(null);
          setError(
            statusData.status === "rejected"
              ? "Connection request was declined"
              : "Connection request expired",
          );
        }
      } catch (err) {
        console.error("Error checking request status:", err);
      }
    };

    const interval = setInterval(checkRequestStatus, 2000);
    checkRequestStatus(); // Check immediately

    return () => clearInterval(interval);
  }, [pendingRequest, sessionId, language, router]);

  // Respond to incoming request
  const handleRespondToRequest = useCallback(
    async (accept: boolean) => {
      if (!sessionId || !incomingRequest) return;

      setIsResponding(true);

      const result = await respondToRequest(
        incomingRequest.id,
        accept,
        sessionId,
      );

      if (result.success) {
        if (accept && result.roomCode) {
          // Navigate to call
          router.push(`/call/${result.roomCode}?host=true&lang=${language}`);
        } else {
          setIncomingRequest(null);
        }
      } else {
        setError(result.error || "Failed to respond");
      }

      setIsResponding(false);
    },
    [sessionId, incomingRequest, language, router],
  );

  // Render user dots on radar
  const renderUserDots = () => {
    return nearbyUsers.map((user, index) => {
      // Calculate position on radar (based on distance)
      const maxRadius = 120; // px
      const normalizedDistance = Math.min(user.distance / 5000, 1);
      const radius = normalizedDistance * maxRadius;

      // Distribute users around the circle
      const angle =
        (index * (360 / Math.max(nearbyUsers.length, 1)) * Math.PI) / 180;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      return (
        <button
          key={user.id}
          onClick={() => setSelectedUser(user)}
          className={`absolute w-10 h-10 rounded-full flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-125 ${
            user.status === "available"
              ? "bg-[#00C896] shadow-lg shadow-[#00C896]/50"
              : "bg-gray-600"
          }`}
          style={{
            left: `calc(50% + ${x}px)`,
            top: `calc(50% + ${y}px)`,
          }}
        >
          <span className="text-lg">{getLanguageFlag(user.language)}</span>
        </button>
      );
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="p-3 text-gray-400 hover:text-white transition min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold text-white">Proximity Connect</h1>
        <div className="w-[44px]" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Status: Initializing */}
        {status === "initializing" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00C896] to-[#0066FF] flex items-center justify-center mx-auto">
              <span className="text-4xl">📡</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Proximity Connect
              </h2>
              <p className="text-gray-400 text-sm max-w-xs mx-auto">
                Find nearby VoxLink users and start translated conversations
                instantly
              </p>
            </div>

            {/* Language Selection */}
            <div className="w-full max-w-xs mx-auto">
              <label className="block text-sm text-gray-400 mb-2 text-center">
                You speak
              </label>
              <div className="grid grid-cols-4 gap-2">
                {LANGUAGES.slice(0, 8).map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`p-3 rounded-lg text-center transition ${
                      language === lang.code
                        ? "bg-[#00C896] text-white"
                        : "bg-[#1a1a2e] text-gray-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xl">
                      {getLanguageFlag(lang.code)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Warning if location was previously denied */}
            {permissionState === "denied" && (
              <div className="w-full max-w-xs p-3 rounded-xl bg-orange-500/10 border border-orange-500/30">
                <p className="text-orange-400 text-xs text-center">
                  ⚠️ Location was previously blocked. Enable it in your browser
                  settings first.
                </p>
              </div>
            )}

            <button
              onClick={startProximity}
              className="w-full max-w-xs py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] hover:from-[#00B085] hover:to-[#0055DD] rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-[#00C896]/25"
            >
              📍 Enable Location & Start
            </button>

            <p className="text-xs text-gray-500 max-w-xs mx-auto">
              Your location is only shared with nearby users and deleted when
              you leave
            </p>
          </div>
        )}

        {/* Status: Requesting Permission */}
        {status === "requesting_permission" && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white">Requesting location access...</p>
          </div>
        )}

        {/* Status: Error */}
        {status === "error" && (
          <div className="text-center space-y-5 max-w-sm px-4">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-4xl">📍</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                Location Access Needed
              </h2>
              <p className="text-gray-400 text-sm">{error}</p>
            </div>

            {/* Instructions to enable location */}
            <div className="p-4 rounded-xl bg-[#1a1a2e] border border-gray-700 text-left space-y-3">
              <p className="text-white text-sm font-medium">
                How to enable location:
              </p>
              <div className="space-y-2 text-xs text-gray-400">
                <p className="flex items-start gap-2">
                  <span className="text-[#00C896]">📱</span>
                  <span>
                    <strong className="text-gray-300">iPhone Safari:</strong>{" "}
                    Settings → Safari → Location → Allow
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#00C896]">📱</span>
                  <span>
                    <strong className="text-gray-300">iPhone Chrome:</strong>{" "}
                    Settings → Chrome → Location → Allow
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#00C896]">🤖</span>
                  <span>
                    <strong className="text-gray-300">Android:</strong> Tap the
                    lock icon in address bar → Permissions → Location → Allow
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#00C896]">💻</span>
                  <span>
                    <strong className="text-gray-300">Desktop:</strong> Click
                    the lock icon next to URL → Site settings → Location → Allow
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] rounded-xl text-white font-semibold transition"
            >
              🔄 Reload & Try Again
            </button>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-gray-400 hover:text-white transition"
            >
              Go Back
            </button>
          </div>
        )}

        {/* Status: Broadcasting (Radar View) */}
        {status === "broadcasting" && (
          <div className="w-full max-w-sm space-y-6">
            {/* Radar */}
            <div className="relative w-72 h-72 mx-auto">
              {/* Radar circles */}
              <div className="absolute inset-0 rounded-full border border-[#00C896]/20" />
              <div className="absolute inset-8 rounded-full border border-[#00C896]/20" />
              <div className="absolute inset-16 rounded-full border border-[#00C896]/20" />
              <div className="absolute inset-24 rounded-full border border-[#00C896]/20" />

              {/* Radar sweep */}
              <div
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{
                  background: `conic-gradient(from ${radarAngle}deg, transparent 0deg, rgba(0,200,150,0.3) 30deg, transparent 60deg)`,
                }}
              />

              {/* Center dot (you) */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <div className="w-6 h-6 rounded-full bg-[#00C896] shadow-lg shadow-[#00C896]/50 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              </div>

              {/* Nearby user dots */}
              {renderUserDots()}

              {/* Distance labels */}
              <span className="absolute top-2 left-1/2 transform -translate-x-1/2 text-xs text-gray-500">
                5km
              </span>
              <span className="absolute top-1/4 left-1/2 transform -translate-x-1/2 text-xs text-gray-500">
                2.5km
              </span>
            </div>

            {/* User count */}
            <div className="text-center">
              <p className="text-white text-lg font-medium">
                {nearbyUsers.length === 0 ? (
                  <span className="text-gray-400">Scanning for users...</span>
                ) : (
                  <>
                    <span className="text-[#00C896]">{nearbyUsers.length}</span>{" "}
                    user{nearbyUsers.length !== 1 ? "s" : ""} nearby
                  </>
                )}
              </p>
              <p className="text-gray-500 text-sm mt-1">
                {getLanguageFlag(language)} Broadcasting as{" "}
                {getLanguageName(language)} speaker
              </p>
            </div>

            {/* Nearby users list */}
            {nearbyUsers.length > 0 && (
              <div className="bg-[#12121a] rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-3 border-b border-gray-800">
                  <h3 className="text-sm font-medium text-white">
                    Nearby Users
                  </h3>
                </div>
                <div className="divide-y divide-gray-800 max-h-48 overflow-y-auto">
                  {nearbyUsers.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      disabled={user.status !== "available"}
                      className={`w-full p-3 flex items-center gap-3 transition ${
                        user.status === "available"
                          ? "hover:bg-[#1a1a2e]"
                          : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span className="text-2xl">
                        {getLanguageFlag(user.language)}
                      </span>
                      <div className="flex-1 text-left">
                        <p className="text-white text-sm">
                          {getLanguageName(user.language)} speaker
                        </p>
                        <p className="text-gray-500 text-xs">
                          {formatDistance(user.distance)} away
                        </p>
                      </div>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          user.status === "available"
                            ? "bg-[#00C896]"
                            : "bg-gray-500"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pending request indicator */}
            {pendingRequest && (
              <div className="p-4 rounded-xl bg-[#00C896]/10 border border-[#00C896]/30 text-center">
                <div className="w-8 h-8 border-2 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-[#00C896] text-sm">
                  Waiting for response...
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected User Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-[#12121a] rounded-2xl border border-gray-800 overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00C896] to-[#0066FF] flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">
                  {getLanguageFlag(selectedUser.language)}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white">
                {getLanguageName(selectedUser.language)} Speaker
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                {formatDistance(selectedUser.distance)} away
              </p>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="text"
                value={connectionMessage}
                onChange={(e) => setConnectionMessage(e.target.value)}
                placeholder="Add a message (optional)"
                maxLength={200}
                className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#00C896] transition"
              />

              <button
                onClick={handleSendRequest}
                disabled={isSending}
                className="w-full py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] hover:from-[#00B085] hover:to-[#0055DD] rounded-xl text-white font-semibold text-lg transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  "📡 Request to Connect"
                )}
              </button>

              <button
                onClick={() => setSelectedUser(null)}
                className="w-full py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Request Modal */}
      {incomingRequest && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-[#12121a] rounded-2xl border border-gray-800 overflow-hidden animate-pulse">
            <div className="p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00C896] to-[#0066FF] flex items-center justify-center mx-auto mb-4 animate-bounce">
                <span className="text-4xl">📡</span>
              </div>
              <h3 className="text-xl font-bold text-white">
                Connection Request!
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                Someone nearby wants to connect
              </p>
              {incomingRequest.message && (
                <p className="text-white text-sm mt-3 p-3 bg-[#1a1a2e] rounded-lg">
                  "{incomingRequest.message}"
                </p>
              )}
            </div>

            <div className="p-4 space-y-3">
              <button
                onClick={() => handleRespondToRequest(true)}
                disabled={isResponding}
                className="w-full py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] hover:from-[#00B085] hover:to-[#0055DD] rounded-xl text-white font-semibold text-lg transition shadow-lg disabled:opacity-50"
              >
                {isResponding ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Connecting...
                  </span>
                ) : (
                  "✓ Accept & Connect"
                )}
              </button>

              <button
                onClick={() => handleRespondToRequest(false)}
                disabled={isResponding}
                className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/30 transition disabled:opacity-50"
              >
                ✕ Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && status !== "error" && (
        <div className="fixed bottom-4 left-4 right-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-center">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProximityPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060810] flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading Proximity...</p>
          </div>
        </div>
      }
    >
      <ProximityContent />
    </Suspense>
  );
}
