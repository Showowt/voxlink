"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { ringChannelName, type CallInvite } from "@/app/lib/ring-signal";
import { startRingPeerListener } from "@/app/lib/ring-peer";
import { deriveDialCode } from "@/app/lib/dial-code";
import { isBlocked, isThrottled } from "@/app/lib/call-block";
import { diag } from "@/app/lib/diag";

// Subscribes this device to its own ring channels and surfaces incoming call
// invites. Mounted once, app-wide (see IncomingCallOverlay).
//
// LIFECYCLE IS THE WHOLE GAME on iOS: WKWebView freezes JS and kills the
// Realtime websocket on every lock/background — and a zombie socket still
// REPORTS 'joined' while being deaf. The original one-shot subscription left
// phones unreachable after any background cycle ("caller rings, callee's
// phone never rings"). This version rebuilds its subscriptions:
//   - unconditionally after returning from >3s hidden (zombies lie),
//   - on pageshow / network 'online',
//   - on CLOSED / CHANNEL_ERROR / TIMED_OUT with capped backoff (never while
//     hidden — frozen timers would burst-fire on resume),
//   - on 'entrevoz:device-id-restored' (identity recovery re-addresses us).
// Dedupe state (handledRooms etc.) lives OUTSIDE rebuilds so caller re-rings
// after a rebuild don't double-ring.
export function useIncomingCall() {
  const [invite, setInvite] = useState<CallInvite | null>(null);
  const inviteRef = useRef<CallInvite | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    // ── Dedupe state survives rebuilds ───────────────────────────────────────
    const handledRooms = new Set<string>();
    const claimedDevices = new Set<string>();
    const declinedRooms = new Set<string>();

    const receiveInvite = (p: CallInvite) => {
      if (cancelled) return;
      if (!p?.room || !p?.fromDevice) return;
      if (Date.now() - (p.t || 0) > 60000) return; // stale — ignore
      if (isBlocked(p.fromDevice)) return; // silenced caller
      if (handledRooms.has(p.room)) {
        // Re-broadcast of a ring we're already showing — ignore quietly.
        return;
      }
      if (inviteRef.current) return; // already ringing for another call
      if (isThrottled(p.fromDevice, Date.now())) {
        // Suppress this call's re-rings too — otherwise each 2.5s re-ring
        // re-enters the throttle path (and a mid-ring expiry would ring late).
        handledRooms.add(p.room);
        return;
      }
      handledRooms.add(p.room);
      inviteRef.current = p;
      setInvite(p);
      diag("invite-received", { room: p.room, from: p.fromDevice, type: p.type });
    };
    const cancelInvite = (room?: string) => {
      if (inviteRef.current && inviteRef.current.room === room) {
        inviteRef.current = null;
        setInvite(null);
      }
    };
    const handleInviteClaimed = (p?: {
      name?: string;
      deviceId?: string;
      lang?: string;
      t?: number;
    }) => {
      if (!p?.deviceId || claimedDevices.has(p.deviceId)) return;
      if (Date.now() - (p.t || 0) > 120000) return; // stale
      claimedDevices.add(p.deviceId);
      try {
        window.dispatchEvent(
          new CustomEvent("entrevoz:invite-claimed", {
            detail: {
              name: p.name || "Your friend",
              deviceId: p.deviceId,
              lang: p.lang || "en",
            },
          }),
        );
      } catch {
        /* ignore */
      }
    };
    const handleDeclined = (room?: string) => {
      if (!room || declinedRooms.has(room)) return;
      declinedRooms.add(room);
      try {
        window.dispatchEvent(
          new CustomEvent("entrevoz:call-declined", { detail: { room } }),
        );
      } catch {
        /* ignore */
      }
    };

    // ── Subscription machinery (rebuildable) ─────────────────────────────────
    let teardownCurrent: (() => void) | null = null;
    let rebuilding = false;
    let lastBuildAt = 0;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const RETRY_DELAYS = [1000, 2000, 5000, 5000, 5000];

    const scheduleRetry = () => {
      if (cancelled || retryTimer) return;
      if (document.visibilityState === "hidden") return; // resume handler covers us
      if (retryCount >= RETRY_DELAYS.length) return; // give up until next resume
      const delay = RETRY_DELAYS[retryCount++];
      retryTimer = setTimeout(() => {
        retryTimer = null;
        rebuild("retry");
      }, delay);
    };

    const build = () => {
      const deviceId = (() => {
        try {
          return getDeviceId();
        } catch {
          return "";
        }
      })();
      if (!deviceId) return () => {};

      const addresses = Array.from(
        new Set([deviceId, deriveDialCode(deviceId)]),
      ).filter(Boolean);

      const cleanups: Array<() => void> = [];
      let buildTornDown = false; // late async peer cleanups must still run
      for (const address of addresses) {
        let peerCleanup: (() => void) | null = null;
        let peerStarted = false;

        const startPeerFallback = () => {
          if (peerStarted || cancelled) return;
          peerStarted = true;
          startRingPeerListener(address, receiveInvite, (event, room) => {
            if (event === "call-canceled") cancelInvite(room);
            else if (event === "call-declined") handleDeclined(room);
          }).then((cleanup) => {
            if (cancelled || buildTornDown) cleanup();
            else peerCleanup = cleanup;
          });
        };

        const channel = supabase.channel(ringChannelName(address), {
          config: { broadcast: { self: false } },
        });
        channel.on("broadcast", { event: "call-invite" }, (msg) =>
          receiveInvite(msg.payload as CallInvite),
        );
        channel.on("broadcast", { event: "call-canceled" }, (msg) =>
          cancelInvite((msg.payload as { room?: string })?.room),
        );
        channel.on("broadcast", { event: "call-declined" }, (msg) =>
          handleDeclined((msg.payload as { room?: string })?.room),
        );
        channel.on("broadcast", { event: "invite-claimed" }, (msg) =>
          handleInviteClaimed(
            msg.payload as { name?: string; deviceId?: string; lang?: string; t?: number },
          ),
        );
        channel.subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            retryCount = 0; // healthy again
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            // Second rail + scheduled rebuild. CLOSED was previously
            // unhandled — the exact state a dead iOS socket leaves behind.
            startPeerFallback();
            scheduleRetry();
          }
        });

        cleanups.push(() => {
          try {
            supabase.removeChannel(channel);
          } catch {
            /* ignore */
          }
          peerCleanup?.();
        });
      }
      return () => {
        buildTornDown = true;
        cleanups.forEach((c) => c());
      };
    };

    const rebuild = (reason: string) => {
      if (cancelled || rebuilding) return;
      // Throttle rebuild storms (visibility+online+pageshow can co-fire).
      if (Date.now() - lastBuildAt < 2000) return;
      rebuilding = true;
      lastBuildAt = Date.now();
      try {
        teardownCurrent?.();
        teardownCurrent = build();
        console.log(`[Ring] listeners rebuilt (${reason})`);
        if (reason !== "retry") diag("ring-rebuilt", { reason });
      } finally {
        rebuilding = false;
      }
    };

    // Initial build.
    lastBuildAt = Date.now();
    teardownCurrent = build();

    // ── Resume/recovery triggers ─────────────────────────────────────────────
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Returning to foreground: a zombie socket still claims 'joined', so if
      // we were hidden long enough for iOS to have frozen us, rebuild
      // UNCONDITIONALLY — one cheap round trip buys a working ring channel.
      if (hiddenAt && Date.now() - hiddenAt > 3000) {
        retryCount = 0;
        rebuild("foreground");
      }
      hiddenAt = 0;
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        retryCount = 0;
        rebuild("bfcache-restore");
      }
    };
    const onOnline = () => {
      retryCount = 0;
      rebuild("online");
    };
    const onIdRestored = () => {
      retryCount = 0;
      rebuild("device-id-restored");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("entrevoz:device-id-restored", onIdRestored);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("entrevoz:device-id-restored", onIdRestored);
      teardownCurrent?.();
    };
  }, []);

  const dismiss = useCallback(() => {
    inviteRef.current = null;
    setInvite(null);
  }, []);

  return { invite, dismiss };
}
