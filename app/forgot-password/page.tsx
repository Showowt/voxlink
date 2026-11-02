"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

type Step = "email" | "code" | "done";

function ForgotPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const e = params.get("email");
    if (e) setEmail(e);
  }, [params]);

  const requestCode = async () => {
    if (!email) {
      setError("Enter your email / Ingresa tu correo");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      setNotice(
        "If an account exists for that email, we sent a 6-digit code. It expires in 10 minutes.\nSi existe una cuenta, enviamos un código de 6 dígitos. Vence en 10 minutos.",
      );
      setStep("code");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code / Ingresa el código de 6 dígitos");
      return;
    }
    if (password.length < 8) {
      setError(
        "Password must be at least 8 characters / La contraseña debe tener al menos 8 caracteres",
      );
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match / Las contraseñas no coinciden");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code,
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Could not reset password. Please try again.");
        setLoading(false);
        return;
      }

      // Password changed — sign in automatically so they land in the app.
      const supabase = createBrowserClient();
      if (supabase) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (!signInErr) {
          router.replace("/dashboard");
          return;
        }
      }
      // Session couldn't be established here — send them to sign in manually.
      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const inputCls =
    "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 transition-colors min-h-[48px]";
  const primaryBtn =
    "w-full bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm hover:bg-[#00E5A0]/90 active:scale-95 transition-all disabled:opacity-50 min-h-[48px]";

  return (
    <div className="min-h-[100dvh] bg-[#030507] flex items-center justify-center px-4 safe-top safe-bottom">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#00E5A0]/5 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-2xl font-black text-white tracking-tight mb-1">
            Entrevoz
          </div>
          <p className="text-white/40 text-sm">
            Reset your password
            <br />
            Restablece tu contraseña
          </p>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6">
          {step === "email" && (
            <div className="flex flex-col gap-3">
              <p className="text-white/50 text-xs leading-relaxed mb-1">
                Enter your account email and we&apos;ll send a 6-digit code.
                <br />
                Ingresa el correo de tu cuenta y te enviaremos un código.
              </p>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email address / Correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestCode()}
                className={inputCls}
              />
              {error && (
                <p className="text-red-400 text-xs text-center whitespace-pre-line" role="alert">
                  {error}
                </p>
              )}
              <button onClick={requestCode} disabled={loading} className={primaryBtn}>
                {loading ? "Sending..." : "Send code / Enviar código"}
              </button>
            </div>
          )}

          {step === "code" && (
            <div className="flex flex-col gap-3">
              {notice && (
                <p className="text-[#00E5A0]/90 text-xs text-center leading-relaxed whitespace-pre-line mb-1">
                  {notice}
                </p>
              )}
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6-digit code / Código de 6 dígitos"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className={`${inputCls} tracking-[0.4em] text-center`}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="New password / Nueva contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password / Confirmar contraseña"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                className={inputCls}
              />
              {error && (
                <p className="text-red-400 text-xs text-center whitespace-pre-line" role="alert">
                  {error}
                </p>
              )}
              <button onClick={verifyCode} disabled={loading} className={primaryBtn}>
                {loading ? "Updating..." : "Reset password / Restablecer"}
              </button>
              <button
                onClick={() => {
                  setStep("email");
                  setError("");
                  setNotice("");
                  setCode("");
                }}
                className="text-white/40 text-xs hover:text-white/60 transition-colors mt-1"
              >
                Didn&apos;t get a code? Try again / ¿No llegó? Reintentar
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="text-center">
              <div className="text-4xl mb-4">✓</div>
              <h2 className="text-white font-bold text-lg mb-2">
                Password updated
              </h2>
              <p className="text-white/50 text-sm mb-6">
                Your password was changed. Sign in with your new password.
                <br />
                Tu contraseña fue cambiada. Inicia sesión con la nueva.
              </p>
              <button
                onClick={() =>
                  router.replace(
                    `/auth?email=${encodeURIComponent(email.trim().toLowerCase())}`,
                  )
                }
                className={primaryBtn}
              >
                Sign In / Iniciar sesión
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/25 text-sm mt-6">
          <a href="/auth" className="hover:text-white/50 transition-colors">
            ← Back to sign in / Volver
          </a>
        </p>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#030507] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00E5A0] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
