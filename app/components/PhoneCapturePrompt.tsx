"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getDeviceId } from "@/app/lib/language-os/device-id";

// ═══════════════════════════════════════════════════════════════════════════════
// PHONE CAPTURE PROMPT — "add your number so friends can reach you when the app
// is closed." Powers the premium WhatsApp/SMS "tap to answer" wake (the SENDING
// is premium; being reachable is free). Dismissible + snoozed; hidden on call
// routes and once a number is saved.
// ═══════════════════════════════════════════════════════════════════════════════

const DISMISS_KEY = "ev_phone_prompt_dismissed_at";
const SAVED_KEY = "ev_phone_saved";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const HIDDEN_ROUTES = ["/call/", "/talk/", "/group/", "/face-to-face"];

const COPY = {
  en: {
    title: "Get calls when the app is closed",
    body: "Add your number so friends can reach you on WhatsApp even when Entrevoz is shut.",
    placeholder: "+57 300 123 4567",
    save: "Save",
    saved: "Saved — you're reachable ✓",
    dismiss: "Not now",
  },
  es: {
    title: "Recibe llamadas con la app cerrada",
    body: "Agrega tu número para que te puedan llamar por WhatsApp aunque Entrevoz esté cerrada.",
    placeholder: "+57 300 123 4567",
    save: "Guardar",
    saved: "Guardado — ya te pueden llamar ✓",
    dismiss: "Ahora no",
  },
};

export default function PhoneCapturePrompt() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [lang, setLang] = useState<"en" | "es">("en");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("entrevoz_lang") || "";
      const nav = typeof navigator !== "undefined" ? navigator.language : "en";
      setLang(saved.startsWith("es") || (!saved && nav.startsWith("es")) ? "es" : "en");
    } catch {
      /* ignore */
    }

    try {
      if (localStorage.getItem(SAVED_KEY) === "1") return; // already has a number
      const d = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (d && Date.now() - d < SNOOZE_MS) return; // snoozed
      // Only ask established users (those who've set a name).
      if (!localStorage.getItem("entrevoz_name")) return;
      // Defer to the notification prompt while it's still pending, so we never
      // stack two asks. (On iOS Safari, Notification is undefined and web push
      // can't work anyway → show the phone ask, which is the better path there.)
      if (typeof Notification !== "undefined" && Notification.permission === "default") return;
    } catch {
      /* ignore */
    }

    // Confirm server-side they don't already have a number saved.
    (async () => {
      try {
        const res = await fetch(
          `/api/phone?deviceId=${encodeURIComponent(getDeviceId())}`,
          { cache: "no-store" },
        );
        const d = await res.json();
        if (d?.hasPhone) {
          try { localStorage.setItem(SAVED_KEY, "1"); } catch { /* ignore */ }
          return;
        }
        setShow(true);
      } catch {
        setShow(true); // network hiccup — still offer it
      }
    })();
  }, []);

  const snooze = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  };

  const save = async () => {
    if (busy) return;
    const phone = value.trim();
    if (phone.replace(/\D/g, "").length < 8) return;
    setBusy(true);
    try {
      const res = await fetch("/api/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId(), phone }),
      });
      const d = await res.json();
      if (d?.ok) {
        try { localStorage.setItem(SAVED_KEY, "1"); } catch { /* ignore */ }
        setDone(true);
        setTimeout(() => setShow(false), 1600);
      }
    } catch {
      /* ignore — they can retry */
    } finally {
      setBusy(false);
    }
  };

  if (!show) return null;
  if (HIDDEN_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const t = COPY[lang];

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[9997] mx-auto max-w-sm rounded-2xl border border-[#00E5A0]/25 bg-[#0c0f0e]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#00E5A0]/30 bg-[#00E5A0]/10 text-lg">
          💬
        </div>
        <div className="min-w-0 flex-1">
          {done ? (
            <p className="py-2 text-sm font-bold text-[#00E5A0]">{t.saved}</p>
          ) : (
            <>
              <p className="text-sm font-bold text-white">{t.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">{t.body}</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="tel"
                  inputMode="tel"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t.placeholder}
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-[#00E5A0]/50 min-h-[40px]"
                />
                <button
                  onClick={save}
                  disabled={busy}
                  className="flex-shrink-0 rounded-xl bg-[#00E5A0] px-4 py-2 text-xs font-bold text-black transition-all active:scale-95 disabled:opacity-50 min-h-[40px]"
                >
                  {busy ? "…" : t.save}
                </button>
              </div>
            </>
          )}
        </div>
        {!done && (
          <button
            onClick={snooze}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white/25 transition-colors hover:text-white/60"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
