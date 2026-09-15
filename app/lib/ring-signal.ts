// ═══════════════════════════════════════════════════════════════════════════════
// RING SIGNAL — Supabase Realtime call invites (no link needed)
//
// Each device listens on its own ring channel (`ring-<deviceId>`). To call a
// saved contact you broadcast a `call-invite` to THEIR ring channel; their app
// shows an incoming-call screen and both land in the same room. This uses
// Realtime broadcast (same mechanism as room-signal.ts) — no DB table, no DDL.
//
// Reachability = "while the app is open." True ring-when-closed needs native
// CallKit/PushKit (a later native build); this is the web-app-open experience.
// ═══════════════════════════════════════════════════════════════════════════════

import { createBrowserClient } from "@/lib/supabase-browser";

export type CallType = "video" | "audio";

export interface CallInvite {
  room: string;
  type: CallType;
  fromDevice: string;
  fromName: string;
  fromLang: string;
  targetLang?: string;
  t: number;
}

export function ringChannelName(deviceId: string): string {
  return `ring-${deviceId}`;
}

// Fire a call invite to a contact's ring channel. Best-effort: subscribe, send
// once, tear down. Resolves true only if the broadcast was actually sent.
export async function sendCallInvite(
  targetDeviceId: string,
  invite: Omit<CallInvite, "t">,
): Promise<boolean> {
  const supabase = createBrowserClient();
  if (!supabase || !targetDeviceId) return false;

  const channel = supabase.channel(ringChannelName(targetDeviceId), {
    config: { broadcast: { self: false, ack: true } },
  });

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    channel.subscribe(async (status) => {
      console.warn("[ring] sender", ringChannelName(targetDeviceId), "->", status);
      if (status === "SUBSCRIBED") {
        try {
          const sendRes = await channel.send({
            type: "broadcast",
            event: "call-invite",
            payload: { ...invite, t: Date.now() },
          });
          console.warn("[ring] send result", sendRes);
          // Let the message flush before we tear the channel down.
          setTimeout(() => done(true), 600);
        } catch (e) {
          console.warn("[ring] send threw", e);
          done(false);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        done(false);
      }
    });

    setTimeout(() => done(false), 5000); // hard cap
  });
}

// Send a lightweight control signal (decline / cancel) to a device's ring
// channel so the other side can dismiss its "calling…" / incoming UI.
export async function sendCallSignal(
  targetDeviceId: string,
  event: "call-declined" | "call-canceled",
  room: string,
): Promise<void> {
  const supabase = createBrowserClient();
  if (!supabase || !targetDeviceId) return;

  const channel = supabase.channel(ringChannelName(targetDeviceId), {
    config: { broadcast: { self: false } },
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      channel.send({
        type: "broadcast",
        event,
        payload: { room, t: Date.now() },
      });
      setTimeout(() => {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }, 400);
    }
  });
}
