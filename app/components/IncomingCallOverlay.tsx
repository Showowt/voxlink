"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useIncomingCall } from "@/hooks/useIncomingCall";
import { sendCallSignal } from "@/app/lib/ring-signal";
import { startRingtone } from "@/app/lib/ringtone";
import { blockDevice } from "@/app/lib/call-block";

// Routes where the user is already in a live session — don't interrupt them
// with an incoming-call takeover there.
const IN_CALL_ROUTES = ["/call/", "/talk/", "/group/", "/face-to-face", "/proximity"];

const FLAGS: Record<string, string> = {
  en: "🇺🇸", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇧🇷",
  zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷", ar: "🇸🇦", ru: "🇷🇺", hi: "🇮🇳",
};

export default function IncomingCallOverlay() {
  const { invite, dismiss } = useIncomingCall();
  const router = useRouter();
  const pathname = usePathname();

  const suppressed = IN_CALL_ROUTES.some((r) => pathname?.startsWith(r));
  const active = !!invite && !suppressed;

  // Audible ring + haptics while a call is incoming (stops on answer/decline).
  useEffect(() => {
    if (!active) return;
    const stop = startRingtone();
    return stop;
  }, [active]);

  // "They declined" feedback for the CALLER — without this, a declined call
  // just looks like "Waiting for partner…" forever.
  const [declined, setDeclined] = useState(false);
  useEffect(() => {
    const onDeclined = () => {
      setDeclined(true);
      setTimeout(() => setDeclined(false), 6000);
    };
    window.addEventListener("entrevoz:call-declined", onDeclined);
    return () =>
      window.removeEventListener("entrevoz:call-declined", onDeclined);
  }, []);

  const declinedToast = declined ? (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10001] flex items-center gap-2 rounded-full bg-[#12121a]/95 border border-white/15 px-5 py-3 shadow-2xl backdrop-blur-xl safe-top">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20">
        <svg className="h-3.5 w-3.5 rotate-[135deg] text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      </span>
      <span className="text-sm font-semibold text-white">Call declined</span>
    </div>
  ) : null;

  if (!invite || suppressed) return declinedToast;

  const accept = () => {
    const { room, type, fromLang } = invite;
    dismiss();
    // Seed the lobby with THIS device's own language as the default (not a
    // caller-imposed preset — the lobby still lets the callee change it), and
    // the caller's language as the "partner speaks" hint so translation is
    // correct from the first word. The lobby is always shown, so the callee
    // still chooses/confirms (guest-language rule respected).
    const myLang =
      (typeof window !== "undefined" && localStorage.getItem("entrevoz_lang")) ||
      "";
    const q = new URLSearchParams({ host: "false" });
    if (myLang) q.set("lang", myLang);
    if (fromLang) q.set("hostLang", fromLang);
    router.push(
      type === "video" ? `/call/${room}?${q}` : `/talk/${room}?${q}`,
    );
  };

  const decline = () => {
    sendCallSignal(invite.fromDevice, "call-declined", invite.room).catch(() => {});
    dismiss();
  };

  const blockCaller = () => {
    blockDevice(invite.fromDevice);
    dismiss();
  };

  const initial = (invite.fromName || "?").charAt(0).toUpperCase();

  return (
    <>
    {declinedToast}
    <div
      className="fixed inset-0 z-[10000] flex flex-col items-center justify-between bg-[#050507]/95 backdrop-blur-xl safe-top safe-bottom"
      role="dialog"
      aria-label="Incoming call"
    >
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[#00E5A0]/10 blur-[130px]" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="mb-8 text-sm font-medium uppercase tracking-[0.3em] text-white/40">
          Incoming {invite.type === "video" ? "video" : "voice"} call
        </p>

        {/* pulsing avatar */}
        <div className="relative mb-6 flex items-center justify-center">
          <span className="absolute h-32 w-32 animate-ping rounded-full bg-[#00E5A0]/20" />
          <span className="absolute h-28 w-28 animate-pulse rounded-full bg-[#00E5A0]/10" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-4xl font-black text-white">
            {initial}
          </div>
        </div>

        <h1 className="text-2xl font-black text-white">
          {invite.fromName || "Someone"}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-white/50">
          <span className="text-base leading-none">{FLAGS[invite.fromLang] || "🌐"}</span>
          is calling you — live translated
        </p>
      </div>

      {/* actions */}
      <div className="relative z-10 mb-6 flex w-full max-w-sm items-center justify-around px-8">
        <button
          onClick={decline}
          className="flex flex-col items-center gap-2"
          aria-label="Decline call"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/30 transition-transform active:scale-90">
            <svg className="h-7 w-7 rotate-[135deg] text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </span>
          <span className="text-xs font-medium text-white/50">Decline</span>
        </button>

        <button
          onClick={accept}
          className="flex flex-col items-center gap-2"
          aria-label="Accept call"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00E5A0] shadow-lg shadow-[#00E5A0]/40 transition-transform active:scale-90 animate-bounce">
            {invite.type === "video" ? (
              <svg className="h-7 w-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="h-7 w-7 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            )}
          </span>
          <span className="text-xs font-medium text-white/50">Accept</span>
        </button>
      </div>

      {/* Silence a spam caller (their ring address is silenced on this device) */}
      <button
        onClick={blockCaller}
        className="relative z-10 mb-6 text-xs font-medium text-white/30 hover:text-white/60 transition-colors"
      >
        Block this caller
      </button>
    </div>
    </>
  );
}
