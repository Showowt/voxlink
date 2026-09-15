"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { ringChannelName, type CallInvite } from "@/app/lib/ring-signal";

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

    const channel = supabase.channel(ringChannelName(deviceId), {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "call-invite" }, (msg) => {
      const p = msg.payload as CallInvite;
      if (!p?.room || !p?.fromDevice) return;
      if (Date.now() - (p.t || 0) > 60000) return; // stale — ignore
      if (inviteRef.current) return; // already ringing for another call
      inviteRef.current = p;
      setInvite(p);
    });

    // Caller hung up before we answered.
    channel.on("broadcast", { event: "call-canceled" }, (msg) => {
      const room = (msg.payload as { room?: string })?.room;
      if (inviteRef.current && inviteRef.current.room === room) {
        inviteRef.current = null;
        setInvite(null);
      }
    });

    channel.subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const dismiss = useCallback(() => {
    inviteRef.current = null;
    setInvite(null);
  }, []);

  return { invite, dismiss };
}
