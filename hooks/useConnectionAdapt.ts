"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const FEATURE_CONNECTION_ADAPT = true;

type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "offline";

interface ConnectionAdaptReturn {
  quality: NetworkQuality;
  shouldReduceVideo: boolean;
  shouldUseTextOnly: boolean;
  latency: number;
  isOffline: boolean;
  adaptedSettings: {
    videoEnabled: boolean;
    videoQuality: "high" | "medium" | "low";
    translationMode: "streaming" | "batched";
  };
}

export function useConnectionAdapt(): ConnectionAdaptReturn {
  const [quality, setQuality] = useState<NetworkQuality>("good");
  const [latency, setLatency] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const pingRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor online/offline
  useEffect(() => {
    if (!FEATURE_CONNECTION_ADAPT || typeof window === "undefined") return;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setQuality("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Periodic latency check
  const checkLatency = useCallback(async () => {
    if (isOffline) return;

    try {
      const start = performance.now();
      const res = await fetch("/api/ping", {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const end = performance.now();

      if (res.ok) {
        const rtt = Math.round(end - start);
        setLatency(rtt);

        if (rtt < 100) setQuality("excellent");
        else if (rtt < 300) setQuality("good");
        else if (rtt < 600) setQuality("fair");
        else setQuality("poor");
      }
    } catch {
      setQuality("poor");
    }
  }, [isOffline]);

  useEffect(() => {
    if (!FEATURE_CONNECTION_ADAPT) return;

    // Initial check
    checkLatency();

    // Check every 15 seconds
    pingRef.current = setInterval(checkLatency, 15000);

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [checkLatency]);

  // Determine adaptive settings
  const shouldReduceVideo = quality === "poor" || quality === "fair";
  const shouldUseTextOnly = quality === "offline";

  const adaptedSettings = {
    videoEnabled: quality !== "offline" && quality !== "poor",
    videoQuality: quality === "excellent" || quality === "good" ? "high" as const :
                  quality === "fair" ? "medium" as const : "low" as const,
    translationMode: quality === "poor" || quality === "fair" ? "batched" as const : "streaming" as const,
  };

  return {
    quality,
    shouldReduceVideo,
    shouldUseTextOnly,
    latency,
    isOffline,
    adaptedSettings,
  };
}

export default useConnectionAdapt;
