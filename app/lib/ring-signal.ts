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
import { sendCallInvitePeer } from "./ring-peer";

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

// Public entry: try Realtime broadcast first; if it's unavailable (anon
// Realtime disabled / channel error), fall back to the PeerJS ring transport
// so the invite still reaches the contact.
export async function sendCallInvite(
  targetDeviceId: string,
  invite: Omit<CallInvite, "t">,
): Promise<boolean> {
  const viaRealtime = await sendCallInviteRealtime(targetDeviceId, invite);
  if (viaRealtime) return true;
  return sendCallInvitePeer(targetDeviceId, invite);
}

// Fire a call invite to a contact's ring channel over Supabase Realtime.
// Best-effort: subscribe, send once, tear down. Resolves true only if the
// broadcast was actually sent.
async function sendCallInviteRealtime(
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
      if (status === "SUBSCRIBED") {
        try {
          await channel.send({
            type: "broadcast",
            event: "call-invite",
            payload: { ...invite, t: Date.now() },
          });
          // Let the message flush before we tear the channel down.
          setTimeout(() => done(true), 600);
        } catch {
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
// Tries Realtime first; falls back to PeerJS when Realtime is unavailable.
export async function sendCallSignal(
  targetDeviceId: string,
  event: "call-declined" | "call-canceled",
  room: string,
): Promise<void> {
  const viaRealtime = await sendCallSignalRealtime(targetDeviceId, event, room);
  if (!viaRealtime) {
    const { sendCallSignalPeer } = await import("./ring-peer");
    await sendCallSignalPeer(targetDeviceId, event, room).catch(() => false);
  }
}

async function sendCallSignalRealtime(
  targetDeviceId: string,
  event: "call-declined" | "call-canceled",
  room: string,
): Promise<boolean> {
  const supabase = createBrowserClient();
  if (!supabase || !targetDeviceId) return false;

  const channel = supabase.channel(ringChannelName(targetDeviceId), {
    config: { broadcast: { self: false } },
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

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        try {
          channel.send({
            type: "broadcast",
            event,
            payload: { room, t: Date.now() },
          });
          setTimeout(() => done(true), 400);
        } catch {
          done(false);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        done(false);
      }
    });

    setTimeout(() => done(false), 5000);
  });
}
