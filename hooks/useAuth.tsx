"use client";

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { User, Session } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "enterprise";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  primary_language: string;
  plan: Plan;
  plan_expires_at?: string;
  trial_ends_at?: string;
  stripe_customer_id?: string;
}

export interface UserLimits {
  is_paid: boolean;
  today_wingman_sessions: number;
  today_translation_chars: number;
  today_video_minutes: number;
  wingman_limit: number;
  translation_char_limit: number;
  video_minute_limit: number;
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  limits: UserLimits | null;
  session: Session | null;
  loading: boolean;
  isPro: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error?: string }>;
  signUpWithEmail: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canUse: (
    feature: "wingman" | "video" | "proximity" | "translation",
  ) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createBrowserClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [limits, setLimits] = useState<UserLimits | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isPro = profile?.plan === "pro" || profile?.plan === "enterprise";

  const trialDaysLeft = profile?.trial_ends_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(profile.trial_ends_at).getTime() - Date.now()) / 86400000,
        ),
      )
    : 0;

  const isTrialing = trialDaysLeft > 0 && !isPro;

  const loadProfile = useCallback(
    async (userId: string) => {
      if (!supabase) return;

      const [profileRes, limitsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("user_limits").select("*").eq("id", userId).single(),
      ]);

      if (profileRes.data) setProfile(profileRes.data as Profile);
      if (limitsRes.data) setLimits(limitsRes.data as UserLimits);
    },
    [supabase],
  );

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLimits(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  const canUse = useCallback(
    (feature: "wingman" | "video" | "proximity" | "translation"): boolean => {
      if (isTrialing || isPro) return true;
      if (!limits) return true;

      switch (feature) {
        case "wingman":
          return limits.today_wingman_sessions < limits.wingman_limit;
        case "video":
          return limits.today_video_minutes < limits.video_minute_limit;
        case "translation":
          return limits.today_translation_chars < limits.translation_char_limit;
        case "proximity":
          return isPro || isTrialing;
        default:
          return true;
      }
    },
    [limits, isPro, isTrialing],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, [supabase]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message };
    },
    [supabase],
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name?: string) => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      return { error: error?.message };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        limits,
        session,
        loading,
        isPro,
        isTrialing,
        trialDaysLeft,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshProfile,
        canUse,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Return safe defaults when used outside provider
    return {
      user: null,
      profile: null,
      limits: null,
      session: null,
      loading: false,
      isPro: false,
      isTrialing: false,
      trialDaysLeft: 0,
      signInWithGoogle: async () => {},
      signInWithEmail: async () => ({ error: "Not in auth context" }),
      signUpWithEmail: async () => ({ error: "Not in auth context" }),
      signOut: async () => {},
      refreshProfile: async () => {},
      canUse: () => true,
    };
  }
  return ctx;
}
