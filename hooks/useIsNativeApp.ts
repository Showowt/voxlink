"use client";

import { useEffect, useState } from "react";

// The Capacitor iOS shell appends "EntrevozApp" to the WebView user agent.
// Detected post-mount to avoid SSR/client hydration mismatch.
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    if (
      navigator.userAgent.includes("EntrevozApp") ||
      typeof (window as { Capacitor?: unknown }).Capacitor !== "undefined"
    ) {
      setIsNative(true);
    }
  }, []);

  return isNative;
}
