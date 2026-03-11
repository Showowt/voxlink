"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

function AuthContent() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail } =
    useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Email and password required");
      return;
    }
    setError("");
    setLoading(true);

    const result =
      mode === "signin"
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, name);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.replace(next);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    await signInWithGoogle();
  };

  return (
    <div className="min-h-screen bg-[#030507] flex items-center justify-center px-4 safe-top safe-bottom">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#00E5A0]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-black text-white tracking-tight mb-1">
            Voxxo
          </div>
          <p className="text-white/40 text-sm">
            {mode === "signin" ? "Welcome back" : "Start your free 7-day trial"}
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={[
                  "flex-1 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px]",
                  mode === m
                    ? "bg-white text-black"
                    : "text-white/40 hover:text-white/60",
                ].join(" ")}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-3 rounded-xl mb-4 hover:bg-white/90 active:scale-95 transition-all disabled:opacity-50 text-sm min-h-[48px]"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              />
            </svg>
            {googleLoading ? "Redirecting..." : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/25 text-xs">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <div className="flex flex-col gap-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 transition-colors min-h-[48px]"
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 transition-colors min-h-[48px]"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 transition-colors min-h-[48px]"
            />

            {error && (
              <p className="text-red-400 text-xs text-center" role="alert">
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm hover:bg-[#00E5A0]/90 active:scale-95 transition-all disabled:opacity-50 mt-1 min-h-[48px]"
            >
              {loading
                ? mode === "signin"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </div>

          {mode === "signup" && (
            <p className="text-white/25 text-xs text-center mt-4 leading-relaxed">
              7-day free trial on Pro. No credit card required.
              <br />
              Cancel anytime.
            </p>
          )}
        </div>

        <p className="text-center text-white/25 text-sm mt-6">
          <a href="/" className="hover:text-white/50 transition-colors">
            ← Back to Voxxo
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#030507] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00E5A0] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
