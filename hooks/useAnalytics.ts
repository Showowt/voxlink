"use client";

import { useCallback, useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { useAuth } from "./useAuth";

export type AnalyticsEvent =
  | "wingman_session_start"
  | "wingman_suggestion_selected"
  | "wingman_session_end"
  | "translation_request"
  | "video_call_start"
  | "video_call_end"
  | "face_to_face_start"
  | "proximity_scan"
  | "proximity_connected"
  | "paywall_seen"
  | "paywall_clicked"
  | "signup_started"
  | "signup_completed"
  | "subscription_started"
  | "subscription_cancelled"
  | "share_app"
  | "onboarding_step"
  | "video_minute_used";

export interface EventMetadata {
  mode?: string;
  language_pair?: string;
  duration_sec?: number;
  tone?: string;
  cyrano_mode?: string;
  step?: string;
  plan?: string;
  feature?: string;
  session_id?: string;
  char_count?: number;
  [key: string]: unknown;
}

export interface UseAnalyticsReturn {
  track: (event: AnalyticsEvent, metadata?: EventMetadata) => void;
  trackSessionStart: (mode: string) => string;
  trackSessionEnd: (sessionId: string, durationSec: number) => void;
  streak: {
    current_streak: number;
    longest_streak: number;
    total_sessions: number;
    total_minutes: number;
  } | null;
}

function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("vox_anon_id");
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("vox_anon_id", id);
  }
  return id;
}

export function useAnalytics(): UseAnalyticsReturn {
  const supabase = createBrowserClient();
  const { user, profile } = useAuth();
  const streakRef = useRef<UseAnalyticsReturn["streak"]>(null);
  const streakLoadedRef = useRef(false);

  const sessionId = getAnonymousId();

  useEffect(() => {
    if (!user || streakLoadedRef.current || !supabase) return;
    streakLoadedRef.current = true;

    supabase
      .from("streaks")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) streakRef.current = data;
      });
  }, [user, supabase]);

  const updateDailyUsage = useCallback(
    async (event: AnalyticsEvent, metadata: EventMetadata) => {
      if (!user || !supabase) return;

      const updates: Record<string, number> = {};
      if (event === "wingman_session_start") updates.wingman_sessions = 1;
      if (event === "translation_request")
        updates.translation_chars = Number(metadata.char_count ?? 100);
      if (event === "video_call_end")
        updates.video_minutes = Math.ceil((metadata.duration_sec ?? 0) / 60);

      if (Object.keys(updates).length === 0) return;

      const today = new Date().toISOString().slice(0, 10);
      await supabase.rpc("increment_daily_usage", {
        p_user_id: user.id,
        p_date: today,
        p_wingman_delta: updates.wingman_sessions ?? 0,
        p_translation_delta: updates.translation_chars ?? 0,
        p_video_delta: updates.video_minutes ?? 0,
      });
    },
    [user, supabase],
  );

  const updateStreak = useCallback(async () => {
    if (!user || !supabase) return;
    await supabase.rpc("update_streak", { p_user_id: user.id });
  }, [user, supabase]);

  const track = useCallback(
    (event: AnalyticsEvent, metadata: EventMetadata = {}) => {
      if (!supabase) return;

      const payload = {
        user_id: user?.id ?? null,
        session_id: sessionId,
        event_type: event,
        mode: metadata.mode ?? null,
        language_pair: metadata.language_pair ?? null,
        duration_sec: metadata.duration_sec ?? null,
        metadata: {
          plan: profile?.plan ?? "free",
          ...metadata,
        },
      };

      supabase
        .from("usage_events")
        .insert(payload)
        .then(() => {});

      if (
        typeof window !== "undefined" &&
        (
          window as unknown as {
            posthog?: {
              capture: (event: string, props: Record<string, unknown>) => void;
            };
          }
        ).posthog
      ) {
        (
          window as unknown as {
            posthog: {
              capture: (event: string, props: Record<string, unknown>) => void;
            };
          }
        ).posthog.capture(event, {
          distinct_id: user?.id ?? sessionId,
          ...metadata,
        });
      }

      if (user) {
        updateDailyUsage(event, metadata);
      }

      if (
        user &&
        [
          "wingman_session_start",
          "video_call_start",
          "face_to_face_start",
          "translation_request",
        ].includes(event)
      ) {
        updateStreak();
      }
    },
    [user, profile, sessionId, supabase, updateDailyUsage, updateStreak],
  );

  const trackSessionStart = useCallback(
    (mode: string): string => {
      const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      track("wingman_session_start", { mode, session_id: id });
      return id;
    },
    [track],
  );

  const trackSessionEnd = useCallback(
    (sessionId: string, durationSec: number) => {
      track("wingman_session_end", {
        session_id: sessionId,
        duration_sec: durationSec,
      });
    },
    [track],
  );

  return {
    track,
    trackSessionStart,
    trackSessionEnd,
    streak: streakRef.current,
  };
}
