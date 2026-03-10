"use client";

/**
 * Voxxo Reconnecting Overlay
 *
 * Shows during connection recovery with:
 * - Progress indicator
 * - Attempt counter
 * - Countdown timer
 * - Cancel button
 */

import { useState, useEffect } from "react";

interface ReconnectingOverlayProps {
  attempt: number;
  maxAttempts: number;
  nextRetryIn?: number; // seconds until next retry
  onCancel?: () => void;
  message?: string;
}

export default function ReconnectingOverlay({
  attempt,
  maxAttempts,
  nextRetryIn,
  onCancel,
  message = "Reconnecting...",
}: ReconnectingOverlayProps) {
  const [countdown, setCountdown] = useState(nextRetryIn || 0);

  // Countdown timer
  useEffect(() => {
    if (nextRetryIn === undefined || nextRetryIn <= 0) return;

    setCountdown(nextRetryIn);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [nextRetryIn]);

  // Calculate progress percentage
  const progress = Math.round((attempt / maxAttempts) * 100);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
      {/* Animated spinner */}
      <div className="relative w-16 h-16 mb-6">
        <div className="absolute inset-0 border-4 border-white/20 rounded-full" />
        <div
          className="absolute inset-0 border-4 border-t-[#00DBA8] border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"
          style={{ animationDuration: "1s" }}
        />
        {/* Inner pulse */}
        <div className="absolute inset-2 bg-[#00DBA8]/20 rounded-full animate-pulse" />
      </div>

      {/* Message */}
      <p className="text-white text-xl font-medium mb-2">{message}</p>

      {/* Attempt counter */}
      <p className="text-zinc-400 text-sm mb-4">
        Attempt {attempt} of {maxAttempts}
      </p>

      {/* Progress bar */}
      <div className="w-48 h-1.5 bg-zinc-700 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00DBA8] to-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Progress dots */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: maxAttempts }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i < attempt
                ? "bg-[#00DBA8]"
                : i === attempt
                  ? "bg-[#00DBA8] animate-pulse"
                  : "bg-zinc-700"
            }`}
          />
        ))}
      </div>

      {/* Countdown to next retry */}
      {countdown > 0 && (
        <p className="text-zinc-500 text-xs mb-4">
          Next retry in {countdown}s...
        </p>
      )}

      {/* Network status tip */}
      <div className="bg-zinc-800/50 rounded-lg px-4 py-2 mb-6 max-w-xs text-center">
        <p className="text-zinc-400 text-xs">
          {attempt <= 2
            ? "Checking connection..."
            : attempt <= 4
              ? "Trying alternative routes..."
              : "Network may be unstable"}
        </p>
      </div>

      {/* Cancel button */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-white transition-colors text-sm px-4 py-2 rounded-lg hover:bg-zinc-800"
        >
          Cancel
        </button>
      )}

      {/* Styles */}
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK STATUS BANNER
// ═══════════════════════════════════════════════════════════════════════════════

export function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Show "back online" briefly
        setShowBanner(true);
        setTimeout(() => setShowBanner(false), 3000);
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
      setWasOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      setIsOnline(false);
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [wasOffline]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-sm font-medium transition-all duration-300 ${
        isOnline ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full" />
          Back online
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
          No internet connection - Some features may not work
        </span>
      )}
    </div>
  );
}
