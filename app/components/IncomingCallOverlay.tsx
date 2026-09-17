"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useIncomingCall } from "@/hooks/useIncomingCall";
import { sendCallSignal, sendCallInvite } from "@/app/lib/ring-signal";
import { startRingtone } from "@/app/lib/ringtone";
import { blockDevice } from "@/app/lib/call-block";
import { generateRoomCode } from "@/app/lib/room-code";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import LanguagePick from "@/app/components/LanguagePick";

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

  // Ring timeout: if the caller abandoned (no cancel signal reached us), don't
  // leave a full-screen ring forever — auto-dismiss after 45s.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(dismiss, 45000);
    return () => clearTimeout(t);
  }, [active, dismiss]);

  // Busy signal: an invite arriving while we're IN another call is never shown
  // — without this it sat queued (a delayed ghost ring) while the caller waited
  // forever. Auto-decline so the caller gets immediate "declined" feedback.
  useEffect(() => {
    if (!invite || !suppressed) return;
    sendCallSignal(invite.fromDevice, "call-declined", invite.room).catch(() => {});
    dismiss();
  }, [invite, suppressed, dismiss]);

  // The callee picks THEIR language BEFORE answering so translation is right
  // from the first word. Pre-filled from their saved preference; changing it
  // persists app-wide.
  const [myRingLang, setMyRingLang] = useState("en");
  useEffect(() => {
    if (!active) return;
    try {
      setMyRingLang(localStorage.getItem("entrevoz_lang") || "en");
    } catch {
      /* ignore */
    }
  }, [active]);
  const pickRingLang = (code: string) => {
    setMyRingLang(code);
    try {
      localStorage.setItem("entrevoz_lang", code);
    } catch {
      /* ignore */
    }
  };

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

  // "X just joined" celebration for the INVITER — fired live when their invite
  // is claimed, so they can make the first call while excitement is peak.
  const [joined, setJoined] = useState<{
    name: string;
    deviceId: string;
    lang: string;
  } | null>(null);
  const [calling, setCalling] = useState(false);
  useEffect(() => {
    const onClaimed = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        name?: string;
        deviceId?: string;
        lang?: string;
      };
      if (!d?.deviceId) return;
      setJoined({
        name: d.name || "Your friend",
        deviceId: d.deviceId,
        lang: d.lang || "en",
      });
      // Celebration chime + haptic (short, not a full ringtone).
      try {
        navigator.vibrate?.([60, 40, 60]);
      } catch {
        /* ignore */
      }
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        [523.25, 659.25, 783.99].forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = f;
          o.connect(g);
          g.connect(ctx.destination);
          g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
          g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.3);
          o.start(ctx.currentTime + i * 0.12);
          o.stop(ctx.currentTime + i * 0.12 + 0.35);
        });
        setTimeout(() => ctx.close().catch(() => {}), 1200);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("entrevoz:invite-claimed", onClaimed);
    return () => window.removeEventListener("entrevoz:invite-claimed", onClaimed);
  }, []);

  // Auto-dismiss the celebration after 30s if untouched.
  useEffect(() => {
    if (!joined) return;
    const t = setTimeout(() => setJoined(null), 30000);
    return () => clearTimeout(t);
  }, [joined]);

  const callJoined = async () => {
    if (!joined || calling) return;
    setCalling(true);
    const room = generateRoomCode();
    const myLang = localStorage.getItem("entrevoz_lang") || "en";
    const myName = localStorage.getItem("entrevoz_name") || "Someone";
    await sendCallInvite(joined.deviceId, {
      room,
      type: "video",
      fromDevice: getDeviceId(),
      fromName: myName,
      fromLang: myLang,
      targetLang: joined.lang,
    });
    const target = joined;
    setJoined(null);
    setCalling(false);
    router.push(
      `/call/${room}?lang=${myLang}&hostLang=${target.lang}&host=true&name=${encodeURIComponent(myName)}&pd=${encodeURIComponent(target.deviceId)}&pn=${encodeURIComponent(target.name)}`,
    );
  };

  const joinedBanner =
    joined && !suppressed && !invite ? (
      <div className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[10001] mx-auto max-w-sm rounded-2xl border border-[#00E5A0]/30 bg-[#0c0f0e]/95 p-4 shadow-2xl shadow-[#00E5A0]/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center">
            <span className="absolute h-12 w-12 animate-ping rounded-full bg-[#00E5A0]/20" />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#00E5A0]/40 bg-[#00E5A0]/10 text-lg font-black text-white">
              {joined.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">
              🎉 {joined.name} just joined!
            </p>
            <p className="text-xs text-white/45">
              They&apos;re in your contacts — say hi, live translated.
            </p>
          </div>
          <button
            onClick={() => setJoined(null)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:text-white/60"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
        <button
          onClick={callJoined}
          disabled={calling}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00E5A0] py-3 text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-50 min-h-[48px]"
        >
          {calling ? "Calling…" : `📹 Call ${joined.name.split(" ")[0]} now`}
        </button>
      </div>
    ) : null;

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

  if (!invite || suppressed)
    return (
      <>
        {declinedToast}
        {joinedBanner}
      </>
    );

  const accept = () => {
    const { room, type, fromLang, fromDevice, fromName } = invite;
    dismiss();
    // Seed the lobby with THIS device's own language as the default (not a
    // caller-imposed preset — the lobby still lets the callee change it), and
    // the caller's language as the "partner speaks" hint so translation is
    // correct from the first word. The lobby is always shown, so the callee
    // still chooses/confirms (guest-language rule respected).
    const myLang =
      myRingLang ||
      (typeof window !== "undefined" && localStorage.getItem("entrevoz_lang")) ||
      "";
    const myName =
      (typeof window !== "undefined" && localStorage.getItem("entrevoz_name")) ||
      "";
    const q = new URLSearchParams({ host: "false" });
    if (myLang) q.set("lang", myLang);
    if (myName) q.set("name", myName); // announce my real name so the caller saves me correctly
    if (fromLang) q.set("hostLang", fromLang);
    // Seed the caller's identity so the room can save them as a contact + log
    // history WITHOUT depending on the in-call handshake (which is racy).
    if (fromDevice) q.set("pd", fromDevice);
    if (fromName) q.set("pn", fromName);
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

        {/* Pick YOUR language before answering so translation is right from
            the first word (pre-filled from your saved preference). */}
        <div className="mt-7 w-full max-w-xs text-left">
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">
            I speak
          </p>
          <LanguagePick value={myRingLang} onChange={pickRingLang} />
        </div>
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
