"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { ringChannelName, type CallInvite } from "@/app/lib/ring-signal";
import { startRingPeerListener } from "@/app/lib/ring-peer";
import { deriveDialCode } from "@/app/lib/dial-code";
import { isBlocked, isThrottled } from "@/app/lib/call-block";

// Subscribes this device to its own ring channel and surfaces an incoming call
// invite. Mounted once, app-wide (see IncomingCallOverlay). One invite at a
// time; stale invites (>60s) are ignored.
export function useIncomingCall() {
  const [invite, setInvite] = useState<CallInvite | null>(null);
  const inviteRef = useRef<CallInvite | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createBrowserClient();
    if (!supabase) return;

    let deviceId = "";
    try {
      deviceId = getDeviceId();
    } catch {
      return;
    }
    if (!deviceId) return;

    let cancelled = false;
    const handledRooms = new Set<string>();
    const cleanups: Array<() => void> = [];

    // Shared receiver for BOTH transports + BOTH addresses (device id + code).
    const receiveInvite = (p: CallInvite) => {
      if (cancelled) return;
      if (!p?.room || !p?.fromDevice) return;
      if (Date.now() - (p.t || 0) > 60000) return; // stale — ignore
      if (isBlocked(p.fromDevice)) return; // silenced caller
      if (isThrottled(p.fromDevice, Date.now())) return; // spam throttle
      if (handledRooms.has(p.room)) return; // dedupe across transports/addresses
      if (inviteRef.current) return; // already ringing for another call
      handledRooms.add(p.room);
      inviteRef.current = p;
      setInvite(p);
    };
    const cancelInvite = (room?: string) => {
      if (inviteRef.current && inviteRef.current.room === room) {
        inviteRef.current = null;
        setInvite(null);
      }
    };

    // Listen on BOTH the device id (used by saved contacts) and the short dial
    // code (used by "dial a code" / QR), so either reaches this device.
    const addresses = Array.from(
      new Set([deviceId, deriveDialCode(deviceId)]),
    ).filter(Boolean);

    for (const address of addresses) {
      let peerCleanup: (() => void) | null = null;
      let peerStarted = false;

      const channel = supabase.channel(ringChannelName(address), {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: "call-invite" }, (msg) =>
        receiveInvite(msg.payload as CallInvite),
      );
      channel.on("broadcast", { event: "call-canceled" }, (msg) =>
        cancelInvite((msg.payload as { room?: string })?.room),
      );
      channel.subscribe((status) => {
        // Realtime unavailable (anon disabled) → PeerJS fallback for this address.
        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          !peerStarted
        ) {
          peerStarted = true;
          startRingPeerListener(address, receiveInvite).then((cleanup) => {
            if (cancelled) cleanup();
            else peerCleanup = cleanup;
          });
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
      cancelled = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  const dismiss = useCallback(() => {
    inviteRef.current = null;
    setInvite(null);
  }, []);

  return { invite, dismiss };
}
