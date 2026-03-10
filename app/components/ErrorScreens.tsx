"use client";

/**
 * Voxxo Error Screen Components
 *
 * Production error UI for:
 * - Connection failures
 * - Permission denials (browser-specific instructions)
 * - Browser unsupported
 * - Room full
 * - Timeout
 */

import { useEffect, useState } from "react";
import {
  useBrowserSupport,
  getPermissionInstructions,
  getRecommendedBrowsers,
} from "../lib/browser-support";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ErrorType =
  | "connection_failed"
  | "permission_denied"
  | "browser_unsupported"
  | "room_full"
  | "timeout"
  | "network_offline"
  | "unknown";

interface BaseErrorProps {
  onRetry?: () => void;
  onBack?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTION FAILED SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function ConnectionFailedScreen({
  onRetry,
  onBack,
  message,
}: BaseErrorProps & { message?: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        Connection Failed
      </h1>

      {/* Message */}
      <p className="text-zinc-400 text-center max-w-md mb-6">
        {message ||
          "Unable to establish connection. This could be due to network issues or firewall restrictions."}
      </p>

      {/* Tips */}
      <div className="bg-zinc-900 rounded-xl p-4 max-w-md w-full mb-8">
        <h3 className="text-white font-medium mb-3">Try these steps:</h3>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">1.</span>
            Check your internet connection
          </li>
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">2.</span>
            Disable VPN if you have one enabled
          </li>
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">3.</span>
            Ask your partner to refresh their page
          </li>
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">4.</span>
            Try using a different network (WiFi vs Mobile)
          </li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-[#00DBA8] text-white hover:bg-[#00C896] transition-all"
          >
            Try Again
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION DENIED SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function PermissionDeniedScreen({
  onRetry,
  onBack,
  permissionType = "camera",
}: BaseErrorProps & { permissionType?: "camera" | "microphone" | "both" }) {
  const support = useBrowserSupport();
  const instructions = getPermissionInstructions(support.browserName);

  const permissionLabel =
    permissionType === "both"
      ? "Camera & Microphone"
      : permissionType === "camera"
        ? "Camera"
        : "Microphone";

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        {permissionLabel} Access Denied
      </h1>

      {/* Message */}
      <p className="text-zinc-400 text-center max-w-md mb-6">
        Voxxo needs access to your {permissionLabel.toLowerCase()} for video
        calls. Please enable permissions in your browser settings.
      </p>

      {/* Browser-specific instructions */}
      <div className="bg-zinc-900 rounded-xl p-4 max-w-md w-full mb-8">
        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
          <span className="text-[#00DBA8]">{support.browserName}</span>{" "}
          Instructions:
        </h3>
        <ol className="space-y-2">
          {instructions.map((step, index) => (
            <li key={index} className="flex gap-3 text-zinc-400 text-sm">
              <span className="bg-zinc-800 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs text-white">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* macOS/iOS specific note */}
      {(support.isIOS || support.isSafari) && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 max-w-md w-full mb-6">
          <p className="text-yellow-400 text-sm">
            <strong>Note for macOS/iOS:</strong> You may also need to allow
            access in System Settings → Privacy & Security → Camera/Microphone
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-[#00DBA8] text-white hover:bg-[#00C896] transition-all"
          >
            Try Again
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER UNSUPPORTED SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function BrowserUnsupportedScreen({
  onBack,
  missingFeatures,
}: BaseErrorProps & { missingFeatures?: string[] }) {
  const browsers = getRecommendedBrowsers();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        Browser Not Supported
      </h1>

      {/* Message */}
      <p className="text-zinc-400 text-center max-w-md mb-4">
        Your browser doesn&apos;t support all features required for video calls
        with live translation.
      </p>

      {/* Missing features */}
      {missingFeatures && missingFeatures.length > 0 && (
        <div className="bg-zinc-900 rounded-xl p-4 max-w-md w-full mb-6">
          <h3 className="text-white font-medium mb-2">Missing features:</h3>
          <ul className="space-y-1">
            {missingFeatures.map((feature, index) => (
              <li
                key={index}
                className="text-zinc-400 text-sm flex items-center gap-2"
              >
                <span className="text-red-400">✕</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended browsers */}
      <div className="bg-zinc-900 rounded-xl p-4 max-w-md w-full mb-8">
        <h3 className="text-white font-medium mb-3">Recommended browsers:</h3>
        <div className="flex gap-3">
          {browsers.map((browser) => (
            <a
              key={browser.name}
              href={browser.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-zinc-800 rounded-lg p-3 text-center hover:bg-zinc-700 transition"
            >
              <span className="text-2xl mb-1 block">{browser.icon}</span>
              <span className="text-white text-sm">{browser.name}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="py-3 px-6 rounded-xl font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
        >
          Go Back
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOM FULL SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function RoomFullScreen({
  onBack,
  roomCode,
}: BaseErrorProps & { roomCode?: string }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        Room is Full
      </h1>

      {/* Message */}
      <p className="text-zinc-400 text-center max-w-md mb-6">
        This call{roomCode ? ` (${roomCode})` : ""} already has 2 participants.
        Voxxo video calls are currently limited to 1-on-1 conversations.
      </p>

      {/* Tips */}
      <div className="bg-zinc-900 rounded-xl p-4 max-w-md w-full mb-8">
        <h3 className="text-white font-medium mb-2">What you can do:</h3>
        <ul className="space-y-2 text-zinc-400 text-sm">
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">•</span>
            Ask one participant to leave
          </li>
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">•</span>
            Create a new room with a different code
          </li>
          <li className="flex gap-2">
            <span className="text-[#00DBA8]">•</span>
            Try again in a few minutes
          </li>
        </ul>
      </div>

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="py-3 px-6 rounded-xl font-medium bg-[#00DBA8] text-white hover:bg-[#00C896] transition-all"
        >
          Go Back Home
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEOUT SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function TimeoutScreen({ onRetry, onBack }: BaseErrorProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        Connection Timed Out
      </h1>

      {/* Message */}
      <p className="text-zinc-400 text-center max-w-md mb-8">
        The connection took too long to establish. This usually happens when the
        other person hasn&apos;t joined yet, or there&apos;s a network issue.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-[#00DBA8] text-white hover:bg-[#00C896] transition-all"
          >
            Try Again
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 px-6 rounded-xl font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
          >
            Go Back
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALL ENDED SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export function CallEndedScreen({
  onBack,
  duration,
  transcriptCount,
}: BaseErrorProps & { duration?: number; transcriptCount?: number }) {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-6">
        <svg
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      {/* Title */}
      <h1 className="text-white text-2xl font-bold mb-3 text-center">
        Call Ended
      </h1>

      {/* Stats */}
      {(duration !== undefined || transcriptCount !== undefined) && (
        <div className="flex gap-6 mb-8">
          {duration !== undefined && (
            <div className="text-center">
              <p className="text-zinc-400 text-sm">Duration</p>
              <p className="text-white text-xl font-mono">
                {formatDuration(duration)}
              </p>
            </div>
          )}
          {transcriptCount !== undefined && transcriptCount > 0 && (
            <div className="text-center">
              <p className="text-zinc-400 text-sm">Messages</p>
              <p className="text-white text-xl font-mono">{transcriptCount}</p>
            </div>
          )}
        </div>
      )}

      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className="py-3 px-6 rounded-xl font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
        >
          Back to Home
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function detectErrorType(error: Error | string): ErrorType {
  const message =
    typeof error === "string"
      ? error.toLowerCase()
      : error.message?.toLowerCase() || "";

  if (
    message.includes("permission") ||
    message.includes("denied") ||
    message.includes("not allowed")
  ) {
    return "permission_denied";
  }

  if (message.includes("room") && message.includes("full")) {
    return "room_full";
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }

  if (message.includes("offline") || message.includes("network")) {
    return "network_offline";
  }

  if (message.includes("unsupported") || message.includes("not supported")) {
    return "browser_unsupported";
  }

  if (
    message.includes("connection") ||
    message.includes("failed") ||
    message.includes("ice")
  ) {
    return "connection_failed";
  }

  return "unknown";
}
