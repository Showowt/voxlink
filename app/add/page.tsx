"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackButton } from "@/app/components/ui/BackButton";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { sendCallInvite } from "@/app/lib/ring-signal";
import { generateRoomCode } from "@/app/lib/room-code";

const FLAGS: Record<string, string> = {
  en: "🇺🇸", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", it: "🇮🇹", pt: "🇧🇷",
  zh: "🇨🇳", ja: "🇯🇵", ko: "🇰🇷", ar: "🇸🇦", ru: "🇷🇺", hi: "🇮🇳",
};

const randomRoom = () => generateRoomCode();

function AddContent() {
  const router = useRouter();
  const params = useSearchParams();
  const theirDevice = params.get("d") || "";
  const theirName = params.get("n") || "Someone";
  const theirLang = params.get("l") || "en";

  const [state, setState] = useState<"idle" | "saving" | "saved" | "self" | "error" | "savefail">("idle");
  const [calling, setCalling] = useState(false);

  useEffect(() => {
    if (!theirDevice) {
      setState("error");
      return;
    }
    const me = getDeviceId();
    if (me === theirDevice) {
      setState("self");
      return;
    }
    setState("saving");
    fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerDeviceId: me,
        contactDeviceId: theirDevice,
        displayName: theirName,
        language: theirLang,
      }),
    })
      // A failed SAVE must not look like an invalid link — you can still call.
      .then((r) => setState(r.ok ? "saved" : "savefail"))
      .catch(() => setState("savefail"));
  }, [theirDevice, theirName, theirLang]);

  const call = async (type: "video" | "audio") => {
    if (!theirDevice) return;
    setCalling(true);
    const room = randomRoom();
    const lang = localStorage.getItem("entrevoz_lang") || "en";
    const name = localStorage.getItem("entrevoz_name") || "Someone";
    await sendCallInvite(theirDevice, {
      room,
      type,
      fromDevice: getDeviceId(),
      fromName: name,
      fromLang: lang,
      targetLang: theirLang,
    });
    router.push(
      type === "video"
        ? `/call/${room}?lang=${lang}&hostLang=${theirLang}&host=true`
        : `/talk/${room}?lang=${lang}&partnerLang=${theirLang}&host=true`,
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#06060a] text-white flex flex-col safe-top safe-bottom">
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <BackButton href="/" label="Home" />
        <h1 className="text-sm font-semibold tracking-tight">Add contact</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {state === "error" ? (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-white font-semibold mb-1">Invalid contact link</p>
            <p className="text-white/40 text-sm mb-6">This add-me link is missing or malformed.</p>
            <button onClick={() => router.push("/dial")} className="px-5 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 text-sm font-semibold min-h-[48px]">
              Open Dial
            </button>
          </>
        ) : state === "self" ? (
          <>
            <div className="text-4xl mb-4">🪞</div>
            <p className="text-white font-semibold mb-1">That&apos;s your own code</p>
            <p className="text-white/40 text-sm mb-6">Share it with someone else so they can call you.</p>
            <button onClick={() => router.push("/dial")} className="px-5 py-3 rounded-xl bg-[#00E5A0] text-black text-sm font-bold min-h-[48px]">
              Back to Dial
            </button>
          </>
        ) : (
          <>
            <div className="relative mb-6 flex items-center justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-4xl font-black">
                {theirName.charAt(0).toUpperCase()}
              </div>
            </div>
            <h2 className="text-2xl font-black">{theirName}</h2>
            <p className="mt-1 mb-1 flex items-center justify-center gap-2 text-sm text-white/50">
              <span className="text-base leading-none">{FLAGS[theirLang] || "🌐"}</span>
              speaks {theirLang.toUpperCase()}
            </p>
            <p className="mb-8 text-xs text-white/35">
              {state === "saving"
                ? "Adding to your contacts…"
                : state === "saved"
                  ? "✓ Saved to your contacts"
                  : state === "savefail"
                    ? "Couldn't save to contacts — you can still call"
                    : ""}
            </p>

            <div className="flex w-full max-w-xs flex-col gap-3">
              <button
                onClick={() => call("video")}
                disabled={calling}
                className="flex items-center justify-center gap-2 bg-[#00E5A0] text-black font-bold py-3.5 rounded-xl text-sm active:scale-95 transition-all disabled:opacity-50 min-h-[52px]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {calling ? "Calling…" : `Call ${theirName.split(" ")[0]}`}
              </button>
              <button
                onClick={() => router.push("/contacts")}
                className="text-white/45 text-sm font-medium hover:text-white/70 transition-colors min-h-[44px]"
              >
                Later — see contacts
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-[#06060a]" />}>
      <AddContent />
    </Suspense>
  );
}
