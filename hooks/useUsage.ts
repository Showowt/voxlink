/**
 * useUsage.ts - Client hook for checking and tracking feature usage
 *
 * Manages sessionId for anonymous users (stored in sessionStorage)
 * Provides functions to check limits and track usage
 *
 * @example
 * const { canUse, remaining, track, isLoading } = useUsage('wingman');
 * if (canUse) {
 *   await track();
 *   // proceed with feature
 * } else {
 *   // show upgrade modal
 * }
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Feature = "wingman" | "video_call" | "proximity" | "translate";

export interface UsageState {
  canUse: boolean;
  remaining: number; // -1 = unlimited
  limit: number; // -1 = unlimited
  used: number;
  plan: "free" | "pro" | "enterprise";
  periodEnds: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface UseUsageReturn extends UsageState {
  track: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  sessionId: string | null;
}

// ─── UUID Generator ───────────────────────────────────────────────────────────
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Session ID Management ────────────────────────────────────────────────────
const SESSION_ID_KEY = "voxxo_session_id";

function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    // Try sessionStorage first (per-session)
    let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
    if (sessionId) return sessionId;

    // Also check localStorage for persistence across sessions
    sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (sessionId) {
      // Copy to sessionStorage for this session
      sessionStorage.setItem(SESSION_ID_KEY, sessionId);
      return sessionId;
    }

    // Generate new UUID
    sessionId = generateUUID();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    localStorage.setItem(SESSION_ID_KEY, sessionId);

    return sessionId;
  } catch {
    // Storage unavailable (incognito, etc.) - generate ephemeral ID
    return generateUUID();
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useUsage(feature: Feature, userId?: string): UseUsageReturn {
  const [state, setState] = useState<UsageState>({
    canUse: false,
    remaining: 0,
    limit: 0,
    used: 0,
    plan: "free",
    periodEnds: null,
    isLoading: true,
    error: null,
  });

  const [sessionId, setSessionId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);

  // Initialize sessionId on mount
  useEffect(() => {
    const id = getOrCreateSessionId();
    setSessionId(id);
  }, []);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    const sid = sessionId || getOrCreateSessionId();
    if (!sid && !userId) return;

    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const params = new URLSearchParams({ feature });
      if (userId) params.set("userId", userId);
      if (sid) params.set("sessionId", sid);

      const res = await fetch(`/api/usage/check?${params.toString()}`);
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: data.error || "Failed to check usage",
          canUse: false,
        }));
        return;
      }

      setState({
        canUse: data.allowed,
        remaining: data.remaining,
        limit: data.limit,
        used: data.used,
        plan: data.plan,
        periodEnds: data.periodEnds,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Network error",
        canUse: false,
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [feature, userId, sessionId]);

  // Initial fetch when sessionId is available
  useEffect(() => {
    isMountedRef.current = true;

    if (sessionId || userId) {
      fetchUsage();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchUsage, sessionId, userId]);

  // Track usage
  const track = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const sid = sessionId || getOrCreateSessionId();
    if (!sid && !userId) {
      return { success: false, error: "No session ID" };
    }

    try {
      const res = await fetch("/api/usage/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature,
          userId,
          sessionId: sid,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Update state with error info
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            canUse: false,
            remaining: data.remaining ?? prev.remaining,
            error: data.error,
          }));
        }
        return { success: false, error: data.error };
      }

      // Update remaining count
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          remaining: data.remaining,
          used: prev.used + 1,
          // Update canUse based on new remaining
          canUse: data.remaining === -1 || data.remaining > 0,
        }));
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: "Network error" };
    }
  }, [feature, userId, sessionId]);

  return {
    ...state,
    track,
    refresh: fetchUsage,
    sessionId,
  };
}

export default useUsage;
