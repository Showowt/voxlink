"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  enableWebPush,
  ensureWebPushSubscribed,
  isIOS,
  isNativeShell,
  isStandalonePWA,
  pushPermission,
} from "@/app/lib/web-push-client";

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ENABLE PROMPT — the UX that turns ON the closed-app wake path for
// WEB users. Without a push subscription a backgrounded/closed web phone can't be
// rung (the exact failure that left calls unanswered). This nudges the user to
// enable notifications; on iOS it first guides the Home-Screen install that Web
// Push requires. Hidden entirely in the native shell (VoIP/CallKit covers it).
// ═══════════════════════════════════════════════════════════════════════════════

const DISMISS_KEY = "ev_push_prompt_dismissed_at";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // re-ask after 3 days if ignored
const HIDDEN_ROUTES = ["/call/", "/talk/", "/group/", "/face-to-face"];

type Mode = "hidden" | "enable" | "ios-install";

const COPY = {
  en: {
    enableTitle: "Get calls when Entrevoz is closed",
    enableBody: "Turn on notifications so friends can reach you even when the app isn't open.",
    enableBtn: "Enable",
    iosTitle: "Get calls when the app is closed",
    iosBody: "Add Entrevoz to your Home Screen, then open it from there to receive call notifications: tap Share, then “Add to Home Screen.”",
    dismiss: "Not now",
  },
  es: {
    enableTitle: "Recibe llamadas con Entrevoz cerrado",
    enableBody: "Activa las notificaciones para que te puedan llamar aunque la app no esté abierta.",
    enableBtn: "Activar",
    iosTitle: "Recibe llamadas con la app cerrada",
    iosBody: "Añade Entrevoz a tu pantalla de inicio y ábrela desde ahí para recibir avisos de llamada: toca Compartir y luego “Añadir a inicio”.",
    dismiss: "Ahora no",
  },
};

export default function NotificationEnablePrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"en" | "es">("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("entrevoz_lang") || "";
      const nav = typeof navigator !== "undefined" ? navigator.language : "en";
      setLang(saved.startsWith("es") || (!saved && nav.startsWith("es")) ? "es" : "en");
    } catch {
      /* ignore */
    }

    if (isNativeShell()) return; // native rings via VoIP — no web prompt

    try {
      const d = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (d && Date.now() - d < SNOOZE_MS) return; // snoozed
    } catch {
      /* ignore */
    }

    const perm = pushPermission();
    if (perm === "granted") {
      void ensureWebPushSubscribed(); // already on — make sure the sub exists
      return;
    }
    if (perm === "denied") return; // can't re-prompt; respect it

    // iOS requires the site be installed to the Home Screen (standalone) before
    // Web Push is available at all — guide that first.
    if (isIOS() && !isStandalonePWA()) {
      setMode("ios-install");
      return;
    }
    if (perm === "unsupported") return; // non-iOS browser without push — nothing to do
    setMode("enable"); // supported + permission not yet asked
  }, []);

  const snooze = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setMode("hidden");
  };

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    const res = await enableWebPush();
    setBusy(false);
    // Granted → done. Denied/dismissed → snooze so we don't nag.
    snooze();
    if (res !== "granted") return;
  };

  if (mode === "hidden") return null;
  if (HIDDEN_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const t = COPY[lang];

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[9998] mx-auto max-w-sm rounded-2xl border border-[#00E5A0]/25 bg-[#0c0f0e]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#00E5A0]/30 bg-[#00E5A0]/10 text-lg">
          🔔
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">
            {mode === "ios-install" ? t.iosTitle : t.enableTitle}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            {mode === "ios-install" ? t.iosBody : t.enableBody}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {mode === "enable" && (
              <button
                onClick={onEnable}
                disabled={busy}
                className="rounded-xl bg-[#00E5A0] px-4 py-2 text-xs font-bold text-black transition-all active:scale-95 disabled:opacity-50 min-h-[40px]"
              >
                {busy ? "…" : t.enableBtn}
              </button>
            )}
            <button
              onClick={snooze}
              className="rounded-xl px-3 py-2 text-xs font-medium text-white/40 transition-colors hover:text-white/70 min-h-[40px]"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
        <button
          onClick={snooze}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/25 transition-colors hover:text-white/60"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
