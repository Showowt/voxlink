"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { ringChannelName, type CallInvite } from "@/app/lib/ring-signal";
import { startRingPeerListener } from "@/app/lib/ring-peer";

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
    let peerCleanup: (() => void) | null = null;
    let peerStarted = false;
    const handledRooms = new Set<string>();

    // Shared receiver for BOTH transports (Realtime + PeerJS fallback).
    const receiveInvite = (p: CallInvite) => {
      if (cancelled) return;
      if (!p?.room || !p?.fromDevice) return;
      if (Date.now() - (p.t || 0) > 60000) return; // stale — ignore
      if (handledRooms.has(p.room)) return; // dedupe across transports
      if (inviteRef.current) return; // already ringing for another call
      handledRooms.add(p.room);
      inviteRef.current = p;
      setInvite(p);
    };

    const channel = supabase.channel(ringChannelName(deviceId), {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "call-invite" }, (msg) =>
      receiveInvite(msg.payload as CallInvite),
    );

    // Caller hung up before we answered.
    channel.on("broadcast", { event: "call-canceled" }, (msg) => {
      const room = (msg.payload as { room?: string })?.room;
      if (inviteRef.current && inviteRef.current.room === room) {
        inviteRef.current = null;
        setInvite(null);
      }
    });

    channel.subscribe((status) => {
      // If Realtime is unavailable (e.g. anon Realtime disabled), fall back to
      // the PeerJS ring transport so invites still arrive.
      if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
        !peerStarted
      ) {
        peerStarted = true;
        startRingPeerListener(deviceId, receiveInvite).then((cleanup) => {
          if (cancelled) cleanup();
          else peerCleanup = cleanup;
        });
      }
    });

    return () => {
      cancelled = true;
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      peerCleanup?.();
    };
  }, []);

  const dismiss = useCallback(() => {
    inviteRef.current = null;
    setInvite(null);
  }, []);

  return { invite, dismiss };
}
