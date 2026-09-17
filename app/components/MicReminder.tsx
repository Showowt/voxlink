"use client";

import { useEffect, useState } from "react";
import { isNativeShell, requestMic } from "@/app/lib/mic-permission";

// ─────────────────────────────────────────────────────────────────────────────
// MIC REMINDER — in-call banner shown when translation is on but the mic isn't
// actually capturing (permission forgotten/denied). One tap re-requests; a hard
// denial gets platform-correct instructions instead of a silent broken call.
// ─────────────────────────────────────────────────────────────────────────────

export default function MicReminder({
  visible,
  onGranted,
  onDismiss,
}: {
  visible: boolean;
  onGranted: () => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  // Fresh incident, fresh state — the component stays mounted between shows,
  // so a past denial must not lock every future reminder into "blocked" copy.
  useEffect(() => {
    if (visible) setDenied(false);
  }, [visible]);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    const res = await requestMic();
    setBusy(false);
    if (res === "granted") {
      setDenied(false);
      onGranted();
    } else {
      setDenied(true);
    }
  };

  return (
    <div className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[9500] mx-auto max-w-sm rounded-2xl border border-amber-400/40 bg-[#141007]/95 p-3.5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xl">🎤</span>
        <div className="min-w-0 flex-1">
          {denied ? (
            <>
              <p className="text-sm font-bold text-amber-300">Microphone is blocked</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/60">
                {isNativeShell()
                  ? "Open iPhone Settings → Entrevoz → allow Microphone, then come back — the call reconnects automatically."
                  : "Allow the microphone in your browser's site settings (tap the 🔒/ᴀA icon in the address bar), then try again."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-300">
                Your mic isn&apos;t on — they can&apos;t hear you
              </p>
              <p className="mt-0.5 text-xs text-white/60">
                Translation needs your microphone to work.
              </p>
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/30 hover:text-white/60"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      {!denied && (
        <button
          onClick={enable}
          disabled={busy}
          className="mt-2.5 w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-50 min-h-[44px]"
        >
          {busy ? "Requesting…" : "Enable microphone"}
        </button>
      )}
    </div>
  );
}
