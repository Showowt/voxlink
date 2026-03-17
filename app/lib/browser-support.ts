/**
 * Entrevoz Browser Support Detection
 *
 * Detects browser capabilities required for video calls, speech recognition,
 * and real-time communication features.
 */

"use client";

import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BrowserSupport {
  // Overall support
  isSupported: boolean;
  missingFeatures: string[];

  // Individual feature detection
  hasWebRTC: boolean;
  hasMediaDevices: boolean;
  hasSpeechRecognition: boolean;
  hasSpeechSynthesis: boolean;
  hasWebSocket: boolean;
  hasIndexedDB: boolean;
  hasLocalStorage: boolean;

  // Browser info
  browserName: string;
  browserVersion: string;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isEdge: boolean;

  // Network info (if available)
  connectionType: string | null;
  effectiveType: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function detectBrowserInfo(): {
  browserName: string;
  browserVersion: string;
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isEdge: boolean;
} {
  if (typeof navigator === "undefined") {
    return {
      browserName: "unknown",
      browserVersion: "0",
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      isSafari: false,
      isChrome: false,
      isFirefox: false,
      isEdge: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();

  // Detect browser
  let browserName = "unknown";
  let browserVersion = "0";

  if (ua.includes("edg/")) {
    browserName = "Edge";
    const match = ua.match(/edg\/(\d+)/);
    browserVersion = match?.[1] || "0";
  } else if (ua.includes("chrome") && !ua.includes("edg")) {
    browserName = "Chrome";
    const match = ua.match(/chrome\/(\d+)/);
    browserVersion = match?.[1] || "0";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browserName = "Safari";
    const match = ua.match(/version\/(\d+)/);
    browserVersion = match?.[1] || "0";
  } else if (ua.includes("firefox")) {
    browserName = "Firefox";
    const match = ua.match(/firefox\/(\d+)/);
    browserVersion = match?.[1] || "0";
  }

  const isMobile =
    /iphone|ipad|ipod|android|webos|blackberry|opera mini|iemobile/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  return {
    browserName,
    browserVersion,
    isMobile,
    isIOS,
    isAndroid,
    isSafari: browserName === "Safari",
    isChrome: browserName === "Chrome",
    isFirefox: browserName === "Firefox",
    isEdge: browserName === "Edge",
  };
}

function detectFeatures(): {
  hasWebRTC: boolean;
  hasMediaDevices: boolean;
  hasSpeechRecognition: boolean;
  hasSpeechSynthesis: boolean;
  hasWebSocket: boolean;
  hasIndexedDB: boolean;
  hasLocalStorage: boolean;
} {
  if (typeof window === "undefined") {
    return {
      hasWebRTC: false,
      hasMediaDevices: false,
      hasSpeechRecognition: false,
      hasSpeechSynthesis: false,
      hasWebSocket: false,
      hasIndexedDB: false,
      hasLocalStorage: false,
    };
  }

  // WebRTC support
  const hasWebRTC = !!(
    window.RTCPeerConnection &&
    window.RTCSessionDescription &&
    window.RTCIceCandidate
  );

  // MediaDevices (camera/microphone)
  const hasMediaDevices = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );

  // Speech Recognition
  const hasSpeechRecognition = !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition
  );

  // Speech Synthesis (TTS)
  const hasSpeechSynthesis = !!window.speechSynthesis;

  // WebSocket
  const hasWebSocket = !!window.WebSocket;

  // IndexedDB
  const hasIndexedDB = !!window.indexedDB;

  // LocalStorage
  let hasLocalStorage = false;
  try {
    hasLocalStorage = !!window.localStorage;
    // Test if actually usable
    localStorage.setItem("__test__", "1");
    localStorage.removeItem("__test__");
  } catch {
    hasLocalStorage = false;
  }

  return {
    hasWebRTC,
    hasMediaDevices,
    hasSpeechRecognition,
    hasSpeechSynthesis,
    hasWebSocket,
    hasIndexedDB,
    hasLocalStorage,
  };
}

function detectNetworkInfo(): {
  connectionType: string | null;
  effectiveType: string | null;
} {
  if (typeof navigator === "undefined") {
    return { connectionType: null, effectiveType: null };
  }

  const connection =
    (
      navigator as unknown as {
        connection?: { type?: string; effectiveType?: string };
      }
    ).connection ||
    (
      navigator as unknown as {
        mozConnection?: { type?: string; effectiveType?: string };
      }
    ).mozConnection ||
    (
      navigator as unknown as {
        webkitConnection?: { type?: string; effectiveType?: string };
      }
    ).webkitConnection;

  return {
    connectionType: connection?.type || null,
    effectiveType: connection?.effectiveType || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DETECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export function detectBrowserSupport(): BrowserSupport {
  const browserInfo = detectBrowserInfo();
  const features = detectFeatures();
  const networkInfo = detectNetworkInfo();

  // Determine missing features
  const missingFeatures: string[] = [];

  if (!features.hasWebRTC) {
    missingFeatures.push("WebRTC (video calls)");
  }
  if (!features.hasMediaDevices) {
    missingFeatures.push("Camera/Microphone access");
  }
  if (!features.hasSpeechRecognition) {
    missingFeatures.push("Speech Recognition");
  }
  if (!features.hasSpeechSynthesis) {
    missingFeatures.push("Text-to-Speech");
  }
  if (!features.hasWebSocket) {
    missingFeatures.push("WebSocket (real-time messaging)");
  }

  // Core requirements for video calls
  const isSupported = features.hasWebRTC && features.hasMediaDevices;

  return {
    isSupported,
    missingFeatures,
    ...features,
    ...browserInfo,
    ...networkInfo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REACT HOOK
// ═══════════════════════════════════════════════════════════════════════════════

export function useBrowserSupport(): BrowserSupport {
  const [support, setSupport] = useState<BrowserSupport>(() => ({
    isSupported: true,
    missingFeatures: [],
    hasWebRTC: true,
    hasMediaDevices: true,
    hasSpeechRecognition: true,
    hasSpeechSynthesis: true,
    hasWebSocket: true,
    hasIndexedDB: true,
    hasLocalStorage: true,
    browserName: "unknown",
    browserVersion: "0",
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    isChrome: false,
    isFirefox: false,
    isEdge: false,
    connectionType: null,
    effectiveType: null,
  }));

  useEffect(() => {
    setSupport(detectBrowserSupport());
  }, []);

  return support;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function getBrowserDownloadUrl(browserName: string): string {
  const urls: Record<string, string> = {
    Chrome: "https://www.google.com/chrome/",
    Edge: "https://www.microsoft.com/edge",
    Safari: "https://www.apple.com/safari/",
    Firefox: "https://www.mozilla.org/firefox/",
  };
  return urls[browserName] || urls.Chrome;
}

export function getRecommendedBrowsers(): Array<{
  name: string;
  url: string;
  icon: string;
}> {
  return [
    { name: "Chrome", url: "https://www.google.com/chrome/", icon: "🌐" },
    { name: "Edge", url: "https://www.microsoft.com/edge", icon: "🌊" },
    { name: "Safari", url: "https://www.apple.com/safari/", icon: "🧭" },
  ];
}

export function getPermissionInstructions(browserName: string): string[] {
  const instructions: Record<string, string[]> = {
    Chrome: [
      "Click the lock icon (🔒) in the address bar",
      'Click "Site settings"',
      'Set Camera and Microphone to "Allow"',
      "Refresh the page",
    ],
    Edge: [
      "Click the lock icon (🔒) in the address bar",
      'Click "Permissions for this site"',
      'Set Camera and Microphone to "Allow"',
      "Refresh the page",
    ],
    Safari: [
      "Go to Safari → Settings → Websites",
      "Select Camera and Microphone",
      'Find this website and set to "Allow"',
      "Refresh the page",
    ],
    Firefox: [
      "Click the shield icon in the address bar",
      'Click "Connection secure" → "More information"',
      "Go to Permissions tab",
      "Enable Camera and Microphone",
    ],
  };
  return instructions[browserName] || instructions.Chrome;
}
