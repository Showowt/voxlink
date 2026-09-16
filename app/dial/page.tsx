"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { BackButton } from "@/app/components/ui/BackButton";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import {
  deriveDialCode,
  formatDialCode,
  normalizeDialCode,
  isValidDialCode,
} from "@/app/lib/dial-code";
import { sendCallInvite } from "@/app/lib/ring-signal";
import { generateRoomCode } from "@/app/lib/room-code";
import { registerDirectory, resolveDialCode } from "@/app/lib/directory";

const randomRoom = () => generateRoomCode();

export default function DialPage() {
  const router = useRouter();
  const [myCode, setMyCode] = useState("");
  const [myName, setMyName] = useState("");
  const [myLang, setMyLang] = useState("en");
  const [qr, setQr] = useState("");
  const [entry, setEntry] = useState("");
  const [copied, setCopied] = useState(false);
  const [calling, setCalling] = useState(false);

  // Load identity on mount.
  useEffect(() => {
    setMyCode(deriveDialCode(getDeviceId()));
    setMyName(localStorage.getItem("entrevoz_name") || "");
    setMyLang(localStorage.getItem("entrevoz_lang") || "en");
  }, []);

  // Regenerate the QR whenever the code/name/lang changes so editing your name
  // updates the QR that others scan (the "add me" deep link carries the name).
  useEffect(() => {
    if (!myCode) return;
    const params = new URLSearchParams({ d: getDeviceId(), c: myCode, l: myLang });
    if (myName.trim()) params.set("n", myName.trim());
    const url = `${window.location.origin}/add?${params.toString()}`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: 240,
      color: { dark: "#0a0a0e", light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [myCode, myName, myLang]);

  // Publish this device's code → identity so anyone who dials the code can save
  // it as a real contact and translate correctly. Debounced so typing a name
  // doesn't spam the endpoint; also fires once on open when the code is ready.
  useEffect(() => {
    if (!myCode) return;
    const t = setTimeout(() => registerDirectory(), 600);
    return () => clearTimeout(t);
  }, [myCode, myName, myLang]);

  // Persist the user's name so their QR / dial / incoming-ring shows it.
  const updateName = (v: string) => {
    setMyName(v);
    try {
      localStorage.setItem("entrevoz_name", v.trim());
    } catch {
      /* ignore */
    }
  };

  const addLink = () => {
    const params = new URLSearchParams({ d: getDeviceId(), c: myCode, l: myLang });
    if (myName) params.set("n", myName);
    return `${window.location.origin}/add?${params.toString()}`;
  };

  const shareCode = async () => {
    const text = `Call me on Entrevoz — live translated. My code is ${formatDialCode(
      myCode,
    )}, or tap: ${addLink()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Entrevoz code", text });
        return;
      } catch {
        /* fall through */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(formatDialCode(myCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const dial = async (type: "video" | "audio") => {
    const code = normalizeDialCode(entry);
    if (!isValidDialCode(code) || code === myCode) return;
    setCalling(true);
    const room = randomRoom();
    const lang = localStorage.getItem("entrevoz_lang") || "en";
    const name = localStorage.getItem("entrevoz_name") || "Someone";

    // Resolve the code to a real identity so we can SAVE this person as a contact
    // right now (a dial code alone can't be saved — it's a one-way hash) and know
    // their language up front. Best-effort + time-boxed; ringing works regardless.
    const resolved = await resolveDialCode(code);
    const partnerLang = resolved?.language || "";
    if (resolved) {
      fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          ownerDeviceId: getDeviceId(),
          contactDeviceId: resolved.deviceId,
          displayName: resolved.displayName || `Contact ${formatDialCode(code)}`,
          language: resolved.language || "en",
        }),
      }).catch(() => {});
    }

    // Ring the code's owner, then enter the room as host.
    await sendCallInvite(code, {
      room,
      type,
      fromDevice: getDeviceId(),
      fromName: name,
      fromLang: lang,
      ...(partnerLang ? { targetLang: partnerLang } : {}),
    });
    const langParam = partnerLang
      ? `&${type === "video" ? "hostLang" : "partnerLang"}=${encodeURIComponent(partnerLang)}`
      : "";
    router.push(
      type === "video"
        ? `/call/${room}?lang=${lang}&host=true${langParam}`
        : `/talk/${room}?lang=${lang}&host=true${langParam}`,
    );
  };

  const entryValid = isValidDialCode(entry) && normalizeDialCode(entry) !== myCode;

  return (
    <div className="min-h-[100dvh] bg-[#06060a] text-white flex flex-col safe-top safe-bottom">
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <BackButton href="/" label="Home" />
        <h1 className="text-sm font-semibold tracking-tight">Dial</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6" style={{ WebkitOverflowScrolling: "touch" }}>
        {/* MY CODE */}
        <div className="max-w-sm mx-auto text-center">
          {/* Your name — so people know who's calling */}
          <div className="mb-6 text-left">
            <label className="text-white/40 text-[10px] uppercase tracking-widest block mb-2">Your name</label>
            <input
              value={myName}
              onChange={(e) => updateName(e.target.value)}
              placeholder="Add your name"
              maxLength={40}
              autoCorrect="off"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-white/25 focus:outline-none focus:border-[#00E5A0]/40 min-h-[48px]"
            />
            <p className="text-white/30 text-[11px] mt-1.5">So people know it&apos;s you when you call or share your code.</p>
          </div>

          <p className="text-white/40 text-xs uppercase tracking-[0.25em] mb-3">Your Entrevoz code</p>
          <div className="text-4xl font-black tracking-[0.15em] text-[#00E5A0] mb-1">
            {myCode ? formatDialCode(myCode) : "· · · · · ·"}
          </div>
          <p className="text-white/35 text-xs mb-5">Share it once — then anyone can call you, no link.</p>

          {qr && (
            <div className="inline-block rounded-2xl bg-white p-3 mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Your Entrevoz QR code" width={200} height={200} className="block" />
            </div>
          )}

          <div className="flex gap-2 justify-center mb-2">
            <button
              onClick={shareCode}
              className="flex-1 bg-[#00E5A0] text-black font-bold py-3 rounded-xl text-sm active:scale-95 transition-all min-h-[48px]"
            >
              Share my code
            </button>
            <button
              onClick={copyCode}
              className="px-5 bg-white/[0.06] border border-white/10 text-white/80 font-semibold py-3 rounded-xl text-sm active:scale-95 transition-all min-h-[48px]"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        {/* DIVIDER */}
        <div className="flex items-center gap-3 max-w-sm mx-auto my-8">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-white/25 text-xs uppercase tracking-widest">or dial a code</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* DIAL A CODE */}
        <div className="max-w-sm mx-auto">
          <input
            value={entry}
            onChange={(e) => setEntry(formatDialCode(normalizeDialCode(e.target.value)))}
            onKeyDown={(e) => e.key === "Enter" && entryValid && dial("video")}
            placeholder="ABC-DEF"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-center text-2xl font-black tracking-[0.2em] bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white placeholder-white/20 focus:outline-none focus:border-[#00E5A0]/40 transition-colors mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => dial("video")}
              disabled={!entryValid || calling}
              className="flex-1 flex items-center justify-center gap-2 bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40 min-h-[52px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {calling ? "Calling…" : "Video call"}
            </button>
            <button
              onClick={() => dial("audio")}
              disabled={!entryValid || calling}
              className="px-5 flex items-center justify-center bg-white/[0.06] border border-white/10 text-white/80 font-semibold py-3.5 rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40 min-h-[52px]"
              title="Voice call"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </button>
          </div>
          <p className="text-white/30 text-xs text-center mt-4 leading-relaxed">
            Ask a friend for their code, or open your camera on their QR.
            <br />
            Their phone rings — no link needed.
          </p>
        </div>
      </div>
    </div>
  );
}
