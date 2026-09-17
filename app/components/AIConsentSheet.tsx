"use client";

import { useEffect, useState } from "react";
import { getAIConsent, setAIConsent } from "@/app/lib/ai-consent";

// ─────────────────────────────────────────────────────────────────────────────
// AI CONSENT SHEET — shown on first launch (and whenever an AI feature is used
// without consent). Discloses exactly WHAT data is sent and TO WHOM, and
// obtains explicit permission BEFORE anything is transmitted (5.1.1/5.1.2).
// ─────────────────────────────────────────────────────────────────────────────

const SERVICES: Array<{ icon: string; what: string; who: string }> = [
  { icon: "🎙️", what: "Your spoken words (audio + transcript)", who: "OpenAI — speech-to-text" },
  { icon: "🌐", what: "Your typed & spoken words", who: "Anthropic Claude — translation" },
  { icon: "🔊", what: "Short voice clips (only if you enable Voice Mimic)", who: "ElevenLabs — voice generation" },
  { icon: "📹", what: "Call audio & video (live calls only)", who: "Daily.co — call connection" },
];

export default function AIConsentSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // First launch: ask BEFORE any AI feature can send data.
    if (getAIConsent() === "unset") setOpen(true);
    const show = () => setOpen(true);
    window.addEventListener("entrevoz:show-ai-consent", show);
    return () => window.removeEventListener("entrevoz:show-ai-consent", show);
  }, []);

  if (!open) return null;

  const agree = () => {
    setAIConsent(true);
    setOpen(false);
  };
  const decline = () => {
    setAIConsent(false);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[10500] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-label="AI translation consent"
    >
      <div className="w-full max-w-md rounded-t-3xl border border-white/[0.1] bg-[#0c0c12] p-6 sm:rounded-3xl safe-bottom max-h-[92dvh] overflow-y-auto">
        <div className="mb-4 text-center">
          <div className="mb-2 text-4xl">🔐</div>
          <h2 className="text-xl font-black text-white">Your words power the translation</h2>
          <p className="mt-1 text-sm text-white/50">
            Entrevoz translates live by sending what you say to trusted AI
            services. Nothing is shared until you agree.
            <span className="mt-1 block text-white/35">
              Entrevoz traduce en vivo enviando lo que dices a servicios de IA
              de confianza. No se comparte nada hasta que aceptes.
            </span>
          </p>
        </div>

        <div className="mb-4 space-y-2">
          {SERVICES.map((s) => (
            <div
              key={s.who}
              className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3"
            >
              <span className="mt-0.5 text-lg">{s.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-white/85">{s.what}</p>
                <p className="text-xs text-[#00E5A0]/80">{s.who}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mb-4 text-center text-[11px] leading-relaxed text-white/40">
          Used only to translate — never sold, never used for ads. Delete your
          data anytime in Settings.{" "}
          <a href="/privacy" className="text-[#00E5A0]/80 underline">
            Privacy Policy
          </a>
        </p>

        <button
          onClick={agree}
          className="w-full rounded-xl bg-[#00E5A0] py-3.5 text-sm font-bold text-black transition-all active:scale-95 min-h-[52px]"
        >
          Agree &amp; Continue · Aceptar y continuar
        </button>
        <button
          onClick={decline}
          className="mt-2 w-full rounded-xl py-3 text-sm font-medium text-white/40 transition-colors hover:text-white/60 min-h-[44px]"
        >
          Not now — browse without translation
        </button>
      </div>
    </div>
  );
}
