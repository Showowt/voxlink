"use client";

import { useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// useWakeLock — keep the screen awake during a call.
//
// On iOS the WebView is SUSPENDED when the screen auto-locks, which freezes
// WebRTC (Daily) / PeerJS and strands a waiting-or-connected call — the exact
// suspend the Daily waiting-watchdog, the group media watchdog, and the /talk
// resume path all RECOVER from. The Screen Wake Lock prevents it in the first
// place: while the user is staring at a ringing/active call, the screen won't
// dim and lock, so the process stays alive and the call connects/holds.
//
// Best-effort: feature-detected (older iOS / some in-app webviews lack it), and
// the OS auto-releases the sentinel whenever the page hides, so we re-acquire on
// visibilitychange. Released on cleanup (leaving the call) and when `active`
// goes false (e.g. no-answer / declined) so a dead screen isn't held awake.
// ═══════════════════════════════════════════════════════════════════════════

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
}
interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const wl = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wl) return; // unsupported — no-op

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || sentinel) return;
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      try {
        const s = await wl.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
        sentinel.addEventListener?.("release", () => {
          sentinel = null;
        });
      } catch {
        /* denied / transient — retry on next visibility */
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => {});
    };
  }, [active]);
}
