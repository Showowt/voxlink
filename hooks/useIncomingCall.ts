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

    // Someone claimed OUR invite — surface a "X just joined" celebration so
    // the inviter can call them while excitement is peak. Deduped by device
    // (the signal can arrive on both listening addresses).
    const claimedDevices = new Set<string>();
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

    // The callee declined OUR outgoing call — tell whatever page is showing
    // "Waiting for partner…" (the caller shouldn't wait forever). Deduped
    // because the signal can arrive on both transports/addresses.
    const declinedRooms = new Set<string>();
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
      channel.on("broadcast", { event: "call-declined" }, (msg) =>
        handleDeclined((msg.payload as { room?: string })?.room),
      );
      channel.on("broadcast", { event: "invite-claimed" }, (msg) =>
        handleInviteClaimed(
          msg.payload as { name?: string; deviceId?: string; lang?: string; t?: number },
        ),
      );
      channel.subscribe((status) => {
        // Realtime unavailable (anon disabled) → PeerJS fallback for this address.
        if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          !peerStarted
        ) {
          peerStarted = true;
          startRingPeerListener(address, receiveInvite, (event, room) => {
            if (event === "call-canceled") cancelInvite(room);
            else if (event === "call-declined") handleDeclined(room);
          }).then((cleanup) => {
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
