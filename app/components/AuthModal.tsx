"use client";

import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { createBrowserClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH MODAL - Premium glassmorphism login/signup modal
// Voxxo Design System - Dark theme, cyan accents, Syne typography
// ═══════════════════════════════════════════════════════════════════════════════

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (user: AuthUser) => void;
  defaultTab?: "login" | "signup";
}

interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthResponse {
  data: {
    user: AuthUser | null;
    session: unknown;
    needsConfirmation?: boolean;
  } | null;
  error: string | null;
  message: string;
}

// Extended CSSProperties for webkit prefixes
interface GlassStyles extends CSSProperties {
  WebkitBackdropFilter?: string;
}

export default function AuthModal({
  isOpen,
  onClose,
  onAuthSuccess,
  defaultTab = "login",
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(defaultTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset form when modal opens/closes or tab changes
  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setEmail("");
      setPassword("");
      setName("");
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, defaultTab]);

  // Clear errors when switching tabs
  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [activeTab]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const endpoint =
          activeTab === "login" ? "/api/auth/login" : "/api/auth/signup";
        const body =
          activeTab === "login"
            ? { email, password }
            : { email, password, name: name || undefined };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const result: AuthResponse = await response.json();

        if (!response.ok || result.error) {
          setError(result.error || result.message || "An error occurred");
          return;
        }

        // Handle signup with email confirmation required
        if (activeTab === "signup" && result.data?.needsConfirmation) {
          setSuccess(
            result.message || "Check your email to confirm your account",
          );
          return;
        }

        // Success - call onAuthSuccess callback
        if (result.data?.user && onAuthSuccess) {
          onAuthSuccess(result.data.user);
        }

        onClose();
      } catch (err) {
        console.error("[AuthModal] Submit error:", err);
        setError("Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, email, password, name, onAuthSuccess, onClose],
  );

  const handleGoogleLogin = useCallback(async () => {
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Authentication not configured");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      }
    } catch (err) {
      console.error("[AuthModal] Google login error:", err);
      setError("Failed to initiate Google login");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAppleLogin = useCallback(async () => {
    const supabase = createBrowserClient();
    if (!supabase) {
      setError("Authentication not configured");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
      }
    } catch (err) {
      console.error("[AuthModal] Apple login error:", err);
      setError("Failed to initiate Apple login");
    } finally {
      setLoading(false);
    }
  }, []);

  if (!isOpen) return null;

  // Glassmorphism styles
  const modalStyles: GlassStyles = {
    background:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    boxShadow:
      "0 8px 32px rgba(0, 0, 0, 0.5), 0 16px 64px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
  };

  const inputStyles: GlassStyles = {
    background: "rgba(255, 255, 255, 0.06)",
    backdropFilter: "blur(16px) saturate(120%)",
    WebkitBackdropFilter: "blur(16px) saturate(120%)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    boxShadow:
      "0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 2px rgba(0, 0, 0, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.05)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-3xl border p-6 sm:p-8 animate-scale-in"
        style={modalStyles}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2
            id="auth-modal-title"
            className="text-fluid-title font-syne font-bold text-white mb-2"
          >
            {activeTab === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-fluid-body text-white/60">
            {activeTab === "login"
              ? "Sign in to access your Voxxo account"
              : "Join Voxxo and break language barriers"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-2xl bg-white/5 p-1 mb-6">
          <button
            onClick={() => setActiveTab("login")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-fluid-btn font-medium transition-all duration-200 ${
              activeTab === "login"
                ? "bg-voxxo-500 text-void-DEFAULT shadow-btn-primary"
                : "text-white/60 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setActiveTab("signup")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-fluid-btn font-medium transition-all duration-200 ${
              activeTab === "signup"
                ? "bg-voxxo-500 text-void-DEFAULT shadow-btn-primary"
                : "text-white/60 hover:text-white"
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-fluid-body-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-status-success/15 border border-status-success/30 text-status-success text-fluid-body-sm">
            {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "signup" && (
            <div>
              <label
                htmlFor="name"
                className="block text-fluid-caption text-white/70 mb-2"
              >
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/40 border transition-all duration-200 focus:outline-none focus:border-voxxo-500/50 focus:ring-2 focus:ring-voxxo-500/20"
                style={inputStyles}
                disabled={loading}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-fluid-caption text-white/70 mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/40 border transition-all duration-200 focus:outline-none focus:border-voxxo-500/50 focus:ring-2 focus:ring-voxxo-500/20"
              style={inputStyles}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-fluid-caption text-white/70 mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                activeTab === "signup" ? "Min. 8 characters" : "Your password"
              }
              className="w-full px-4 py-3 rounded-xl text-white placeholder:text-white/40 border transition-all duration-200 focus:outline-none focus:border-voxxo-500/50 focus:ring-2 focus:ring-voxxo-500/20"
              style={inputStyles}
              required
              minLength={activeTab === "signup" ? 8 : 1}
              disabled={loading}
              autoComplete={
                activeTab === "signup" ? "new-password" : "current-password"
              }
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 rounded-2xl font-semibold text-fluid-btn bg-gradient-to-r from-voxxo-500 to-voxxo-600 text-void-DEFAULT shadow-btn-primary hover:from-voxxo-400 hover:to-voxxo-500 hover:shadow-btn-primary-hover hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : activeTab === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-fluid-caption">
            <span className="px-3 bg-void-DEFAULT text-white/40">
              or continue with
            </span>
          </div>
        </div>

        {/* Social Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              ...inputStyles,
              background: "rgba(255, 255, 255, 0.04)",
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="text-fluid-btn-sm">Google</span>
          </button>

          <button
            onClick={handleAppleLogin}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              ...inputStyles,
              background: "rgba(255, 255, 255, 0.04)",
            }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span className="text-fluid-btn-sm">Apple</span>
          </button>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-fluid-caption text-white/40">
          By continuing, you agree to our{" "}
          <a
            href="/terms"
            className="text-voxxo-500 hover:text-voxxo-400 transition-colors"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="text-voxxo-500 hover:text-voxxo-400 transition-colors"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

export { AuthModal };
