"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { formatDialCode } from "@/app/lib/dial-code";
import { sendCallInvite } from "@/app/lib/ring-signal";
import { generateRoomCode } from "@/app/lib/room-code";

// ─────────────────────────────────────────────────────────────────────────────
// INVITE LANDING — /i/<code>
// The invitee opens a friend's invite: one tap connects them (both become
// contacts, they get their own dial code) — no account, no phone number.
// ─────────────────────────────────────────────────────────────────────────────

const LANGS: Array<{ code: string; flag: string; label: string }> = [
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇧🇷", label: "Português" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
];

interface InviteInfo {
  inviterName: string;
  inviterLang: string;
  claimed: boolean;
  claimedBy: string | null;
}

interface ClaimResult {
  inviter: { deviceId: string; name: string; lang: string };
  yourCode: string;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "claiming" | "connected" | "used" | "invalid"
  >("loading");
  const [myName, setMyName] = useState("");
  const [myLang, setMyLang] = useState("en");
  const [claim, setClaim] = useState<ClaimResult | null>(null);
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    if (!code) {
      setState("invalid");
      return;
    }
    setMyName(localStorage.getItem("entrevoz_name") || "");
    setMyLang(localStorage.getItem("entrevoz_lang") || "en");
    fetch(`/api/invite?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d?.found) {
          setState("invalid");
          return;
        }
        setInfo(d);
        if (d.claimed && d.claimedBy !== getDeviceId()) {
          setState("used");
        } else {
          setState("ready");
        }
      })
      .catch(() => setState("invalid"));
  }, [code]);

  const accept = async () => {
    setState("claiming");
    try {
      const res = await fetch("/api/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: code,
          deviceId: getDeviceId(),
          name: myName.trim() || undefined,
          lang: myLang,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d?.success) {
        setState(d?.error === "already_claimed" ? "used" : "invalid");
        return;
      }
      // Persist identity so the whole app carries it from now on.
      try {
        if (myName.trim()) localStorage.setItem("entrevoz_name", myName.trim());
        localStorage.setItem("entrevoz_lang", myLang);
        localStorage.setItem("entrevoz_name_prompted", "true");
      } catch {
        /* ignore */
      }
      setClaim(d);
      setState("connected");
    } catch {
      setState("ready");
    }
  };

  const callNow = async (type: "video" | "audio") => {
    if (!claim) return;
    setCalling(true);
    const room = generateRoomCode();
    await sendCallInvite(claim.inviter.deviceId, {
      room,
      type,
      fromDevice: getDeviceId(),
      fromName: myName.trim() || "Someone",
      fromLang: myLang,
      targetLang: claim.inviter.lang,
    });
    const seed = `&name=${encodeURIComponent(myName.trim() || "Someone")}&pd=${encodeURIComponent(claim.inviter.deviceId)}&pn=${encodeURIComponent(claim.inviter.name)}`;
    router.push(
      type === "video"
        ? `/call/${room}?lang=${myLang}&hostLang=${claim.inviter.lang}&host=true${seed}`
        : `/talk/${room}?lang=${myLang}&partnerLang=${claim.inviter.lang}&host=true${seed}`,
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#06060a] text-white flex flex-col safe-top safe-bottom">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {state === "loading" ? (
          <div className="text-white/30 text-sm">Loading invite…</div>
        ) : state === "invalid" ? (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-white font-semibold mb-1">Invite not found</p>
            <p className="text-white/40 text-sm mb-6">
              This invite link is missing or was cancelled.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-3 rounded-xl bg-[#00E5A0] text-black text-sm font-bold min-h-[48px]"
            >
              Open Entrevoz
            </button>
          </>
        ) : state === "used" ? (
          <>
            <div className="text-4xl mb-4">🔒</div>
            <p className="text-white font-semibold mb-1">Already used</p>
            <p className="text-white/40 text-sm mb-6">
              This invite was claimed on another device. Ask{" "}
              {info?.inviterName || "your friend"} for a new one.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-5 py-3 rounded-xl bg-[#00E5A0] text-black text-sm font-bold min-h-[48px]"
            >
              Open Entrevoz
            </button>
          </>
        ) : state === "connected" && claim ? (
          <>
            <div className="text-5xl mb-4">🤝</div>
            <h1 className="text-2xl font-black mb-1">
              You &amp; {claim.inviter.name} are connected
            </h1>
            <p className="text-white/45 text-sm mb-6">
              Calls between you translate live — speak your language, they hear
              theirs.
            </p>
            <div className="w-full max-w-xs flex flex-col gap-3 mb-8">
              <button
                onClick={() => callNow("video")}
                disabled={calling}
                className="flex items-center justify-center gap-2 bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm active:scale-95 transition-all disabled:opacity-50 min-h-[52px]"
              >
                {calling ? "Calling…" : `📹 Call ${claim.inviter.name} now`}
              </button>
              <button
                onClick={() => router.push("/")}
                className="text-white/45 text-sm font-medium hover:text-white/70 transition-colors min-h-[44px]"
              >
                Explore Entrevoz first
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">
                Your Entrevoz code
              </p>
              <p className="text-xl font-black tracking-[0.15em] text-[#00E5A0]">
                {formatDialCode(claim.yourCode)}
              </p>
              <p className="text-white/35 text-xs mt-1">
                Share it — anyone can call you, no link needed.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-4xl font-black mb-6">
              {(info?.inviterName || "?").charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-black mb-1">
              {info?.inviterName} invited you
            </h1>
            <p className="text-white/45 text-sm mb-7 max-w-xs">
              Talk to each other in different languages — Entrevoz translates
              live while you speak. Free, no phone number needed.
            </p>

            <div className="w-full max-w-xs text-left mb-4">
              <label className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">
                Your name
              </label>
              <input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="So they know it's you"
                maxLength={40}
                autoCorrect="off"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 min-h-[48px]"
              />
            </div>
            <div className="w-full max-w-xs text-left mb-7">
              <label className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">
                I speak
              </label>
              <div className="grid grid-cols-4 gap-2">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setMyLang(l.code)}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-all min-h-[48px] ${
                      myLang === l.code
                        ? "border-[#00E5A0]/60 bg-[#00E5A0]/10 text-white"
                        : "border-white/10 bg-white/[0.04] text-white/60"
                    }`}
                  >
                    <span className="block text-lg leading-none mb-0.5">{l.flag}</span>
                    {l.code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={accept}
              disabled={state === "claiming"}
              className="w-full max-w-xs bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm active:scale-95 transition-all disabled:opacity-50 min-h-[52px]"
            >
              {state === "claiming" ? "Connecting…" : "Accept & Connect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
