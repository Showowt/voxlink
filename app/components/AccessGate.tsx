"use client";

import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS GATE - 4-Digit Code Protection
// Temporary security layer until full auth/subscription system is built
// ═══════════════════════════════════════════════════════════════════════════════

export const STORAGE_KEY = "entrevoz_access_token";

interface AccessGateProps {
  children: React.ReactNode;
}

export default function AccessGate({ children }: AccessGateProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Verify token cryptographically on mount
  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem(STORAGE_KEY);

      // No token = not authorized
      if (!token) {
        setIsAuthorized(false);
        return;
      }

      // Verify token with server (cryptographic check)
      try {
        const res = await fetch("/api/verify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.valid) {
            setIsAuthorized(true);
            return;
          }
        }

        // Token invalid or expired - clear it
        localStorage.removeItem(STORAGE_KEY);
        setIsAuthorized(false);
      } catch {
        // Network error - allow if token looks valid (format check as fallback)
        // This prevents lockout during brief connectivity issues
        // Token format: timestamp:nonce:signature (colon-separated)
        const hasValidFormat =
          token.includes(":") && token.split(":").length === 3;
        setIsAuthorized(hasValidFormat);
      }
    };

    verifyToken();
  }, []);

  // Handle digit input
  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newCode = [...code];
    newCode[index] = value.slice(-1); // Only last digit

    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when all digits entered
    if (index === 3 && value) {
      const fullCode = newCode.join("");
      if (fullCode.length === 4) {
        setTimeout(() => verifyCode(fullCode), 100);
      }
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
    if (e.key === "Enter") {
      verifyCode(code.join(""));
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (pasted.length === 4) {
      setCode(pasted.split(""));
      setTimeout(() => verifyCode(pasted), 100);
    }
  };

  // Verify code via server API with retry logic
  const verifyCode = async (enteredCode: string, retryCount = 0) => {
    if (enteredCode.length !== 4 || isLoading) return;

    setIsLoading(true);
    setError("");

    const MAX_RETRIES = 2;

    try {
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: enteredCode }),
      });

      // Handle non-OK responses (including 405 from SW interference)
      if (!res.ok) {
        if (retryCount < MAX_RETRIES) {
          // Wait briefly and retry (service worker should be ready now)
          await new Promise((r) => setTimeout(r, 500));
          setIsLoading(false);
          return verifyCode(enteredCode, retryCount + 1);
        }
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();

      if (data.valid && data.token) {
        localStorage.setItem(STORAGE_KEY, data.token);
        setIsAuthorized(true);
      } else {
        setError(data.error || "Invalid code");
        setIsShaking(true);
        setTimeout(() => {
          setIsShaking(false);
          setCode(["", "", "", ""]);
          document.getElementById("code-0")?.focus();
        }, 500);
      }
    } catch {
      // Auto-retry on connection errors (SW install interference)
      if (retryCount < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500));
        setIsLoading(false);
        return verifyCode(enteredCode, retryCount + 1);
      }
      setError("Connection error. Please try again.");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Authorized - show app
  if (isAuthorized) {
    return <>{children}</>;
  }

  // Access gate
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg shadow-cyan-500/25">
            <span className="text-4xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Entrevoz Access
          </h1>
          <p className="text-gray-400 text-sm">
            Enter your 4-digit access code
          </p>
        </div>

        {/* Code Input */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
          <div
            className={`flex justify-center gap-3 mb-6 ${isShaking ? "animate-shake" : ""}`}
            onPaste={handlePaste}
          >
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={isLoading}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                autoComplete="one-time-code"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint={index === 3 ? "go" : "next"}
                aria-label={`Digit ${index + 1} of 4`}
                className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 bg-[#1a1a2e] text-white focus:outline-none transition-all disabled:opacity-50 ${
                  error
                    ? "border-red-500"
                    : digit
                      ? "border-cyan-500"
                      : "border-gray-700 focus:border-cyan-500"
                }`}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-center text-sm mb-4">{error}</p>
          )}

          {/* Submit Button */}
          <button
            onClick={() => verifyCode(code.join(""))}
            disabled={code.some((d) => !d) || isLoading}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition shadow-lg ${
              code.every((d) => d) && !isLoading
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/25 hover:from-cyan-600 hover:to-blue-700"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Verifying...
              </span>
            ) : (
              "Enter"
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">
            Contact administrator for access code
          </p>
          <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
            <div className="flex justify-center gap-4 text-[10px]">
              <a
                href="/privacy"
                className="text-gray-500 hover:text-cyan-400 transition"
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                className="text-gray-500 hover:text-cyan-400 transition"
              >
                Terms of Service
              </a>
            </div>
            <div>
              <span className="text-xs text-gray-500">Powered by </span>
              <span className="text-xs text-cyan-500 font-semibold">
                MachineMind
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          10%,
          30%,
          50%,
          70%,
          90% {
            transform: translateX(-5px);
          }
          20%,
          40%,
          60%,
          80% {
            transform: translateX(5px);
          }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
