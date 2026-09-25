"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  consumeShowRequest,
  getAIConsent,
  installAIConsentGuard,
  onShowAIConsent,
  setAIConsent,
} from "@/app/lib/ai-consent";

// Hold every AI-bound request until the user answers this sheet. Runs at
// module load (before any page effect can fetch), not in an effect.
installAIConsentGuard();

// ─────────────────────────────────────────────────────────────────────────────
// AI CONSENT SHEET — shown on first launch and whenever an AI feature is used
// without consent. Discloses exactly WHAT data is sent and TO WHOM, and
// obtains explicit permission BEFORE anything is transmitted (5.1.1/5.1.2).
// ─────────────────────────────────────────────────────────────────────────────

type Lang = "en" | "es";

interface Recipient {
  icon: string;
  what: Record<Lang, string>;
  who: Record<Lang, string>;
}

const RECIPIENTS: Recipient[] = [
  {
    icon: "🎙️",
    what: {
      en: "Recordings of your voice",
      es: "Grabaciones de tu voz",
    },
    who: {
      en: "OpenAI (Whisper) — turns speech into text",
      es: "OpenAI (Whisper) — convierte voz en texto",
    },
  },
  {
    icon: "🌐",
    what: {
      en: "Words you type or speak, with recent lines of the conversation",
      es: "Lo que escribes o dices, con las últimas frases de la conversación",
    },
    who: {
      en: "Anthropic (Claude), Google Translate, MyMemory — translation",
      es: "Anthropic (Claude), Google Translate, MyMemory — traducción",
    },
  },
  {
    icon: "💬",
    what: {
      en: "Messages you send in Practice and Wingman",
      es: "Mensajes que envías en Práctica y Wingman",
    },
    who: {
      en: "Anthropic (Claude) — AI tutor and coach replies",
      es: "Anthropic (Claude) — respuestas del tutor y coach de IA",
    },
  },
  {
    icon: "🔊",
    what: {
      en: "Translated text, plus short voice samples if you turn on Voice Mimic",
      es: "Texto traducido, y muestras cortas de voz si activas Voice Mimic",
    },
    who: {
      en: "ElevenLabs — spoken voice, only when you turn voice on",
      es: "ElevenLabs — voz hablada, solo si activas la voz",
    },
  },
  {
    icon: "📹",
    what: {
      en: "Live call audio and video",
      es: "Audio y video de llamadas en vivo",
    },
    who: {
      en: "Daily.co — connects video calls (not AI)",
      es: "Daily.co — conecta videollamadas (no es IA)",
    },
  },
];

const COPY: Record<
  Lang,
  { title: string; lead: string; use: string; manage: string; policy: string; allow: string; deny: string; toggle: string }
> = {
  en: {
    title: "Allow AI translation?",
    lead: "Entrevoz uses third-party AI services to transcribe, translate and speak for you. This is exactly what is sent and who receives it. Nothing is sent unless you tap Allow.",
    use: "Used only to provide these features — never sold, never used for ads.",
    manage: "Change this anytime in Profile → Account & Privacy.",
    policy: "Privacy Policy",
    allow: "Allow",
    deny: "Don't Allow",
    toggle: "Español",
  },
  es: {
    title: "¿Permitir traducción con IA?",
    lead: "Entrevoz usa servicios de IA de terceros para transcribir, traducir y dar voz. Esto es exactamente lo que se envía y quién lo recibe. No se envía nada a menos que toques Permitir.",
    use: "Se usa solo para estas funciones — nunca se vende ni se usa para publicidad.",
    manage: "Puedes cambiarlo cuando quieras en Perfil → Cuenta y privacidad.",
    policy: "Política de privacidad",
    allow: "Permitir",
    deny: "No permitir",
    toggle: "English",
  },
};

// The sheet must not cover the documents it links to.
const LEGAL_PAGES = ["/privacy", "/terms"];

export default function AIConsentSheet() {
  const pathname = usePathname();
  const onLegalPage = LEGAL_PAGES.includes(pathname);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  // Set when the user leaves the sheet to read the policy without answering;
  // the sheet returns as soon as they are back in the app.
  const reopenAfterLegal = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("entrevoz_lang") || navigator.language || "";
      if (saved.toLowerCase().startsWith("es")) setLang("es");
    } catch {
      /* ignore */
    }
    return onShowAIConsent(() => setOpen(true));
  }, []);

  useEffect(() => {
    if (onLegalPage) return;
    // First launch, a request raised before this sheet subscribed, or the
    // user coming back from the policy without having answered.
    const pending = consumeShowRequest() || reopenAfterLegal.current;
    reopenAfterLegal.current = false;
    if (pending || getAIConsent() === "unset") setOpen(true);
  }, [onLegalPage]);

  if (!open) return null;

  const t = COPY[lang];
  const answer = (granted: boolean) => {
    setAIConsent(granted);
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[10500] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="AI translation consent"
    >
      <div className="w-full max-w-md rounded-t-3xl border border-white/[0.1] bg-[#0c0c12] p-6 sm:rounded-3xl safe-bottom max-h-[92dvh] overflow-y-auto">
        <div className="mb-1 flex justify-end">
          <button
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            className="min-h-[36px] rounded-full px-3 text-xs font-medium text-white/45 transition-colors hover:text-white/70"
          >
            {t.toggle}
          </button>
        </div>

        <div className="mb-4 text-center">
          <div className="mb-2 text-4xl" aria-hidden="true">🔐</div>
          <h2 className="text-xl font-black text-white">{t.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{t.lead}</p>
        </div>

        <ul className="mb-4 space-y-2">
          {RECIPIENTS.map((r) => (
            <li
              key={r.icon}
              className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3"
            >
              <span className="mt-0.5 text-lg" aria-hidden="true">{r.icon}</span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-snug text-white/85">{r.what[lang]}</p>
                <p className="mt-0.5 text-xs leading-snug text-[#00E5A0]/85">→ {r.who[lang]}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mb-4 text-center text-[11px] leading-relaxed text-white/45">
          {t.use} {t.manage}{" "}
          <Link
            href="/privacy"
            onClick={() => {
              reopenAfterLegal.current = true;
              setOpen(false);
            }}
            className="text-[#00E5A0]/85 underline"
          >
            {t.policy}
          </Link>
        </p>

        <button
          onClick={() => answer(true)}
          className="w-full rounded-xl bg-[#00E5A0] py-3.5 text-sm font-bold text-black transition-all active:scale-95 min-h-[52px]"
        >
          {t.allow}
        </button>
        <button
          onClick={() => answer(false)}
          className="mt-2 w-full rounded-xl border border-white/[0.08] py-3 text-sm font-medium text-white/60 transition-colors hover:text-white/80 min-h-[48px]"
        >
          {t.deny}
        </button>
      </div>
    </div>
  );
}
