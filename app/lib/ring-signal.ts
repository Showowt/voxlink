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


// The re-ring loop keeps a transient channel alive on `ring-<target>` for ~1s
// of every 2.5s cycle. supabase.channel() DEDUPES by topic: creating "again"
// returns the live instance, whose subscribe() is then a silent no-op — the
// cancel/decline/invite never sent and the 5s cap ate it. If a joined channel
// already exists for the topic, send on it directly and DON'T tear it down
// (its owner will); otherwise do the normal create/subscribe/send/teardown.
function findJoinedChannel(
  supabase: NonNullable<ReturnType<typeof createBrowserClient>>,
  target: string,
) {
  try {
    const topic = `realtime:${ringChannelName(target)}`;
    return (
      supabase
        .getChannels()
        .find((c) => c.topic === topic && c.state === "joined") || null
    );
  } catch {
    return null;
  }
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
  opts?: { skipPush?: boolean },
): Promise<boolean> {
  // STORE-AND-FORWARD: persist the invite so the callee can PULL it over HTTP
  // even when its socket is dead (the reliability backbone). Fire-and-forget;
  // the re-ring loop re-posts to keep it fresh / revive a spurious cancel.
  try {
    void fetch("/api/ring/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        room: invite.room,
        toAddress: targetDeviceId,
        fromDevice: invite.fromDevice,
        fromName: invite.fromName,
        fromLang: invite.fromLang,
        type: invite.type,
        targetLang: invite.targetLang,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  // Also fire a VoIP push (best-effort) so a CLOSED device rings via native
  // CallKit — runs in parallel with the in-app Realtime/PeerJS invite.
  // Re-ring loops pass skipPush so the push fires once, not every 2.5s.
  if (!opts?.skipPush) {
    import("./native-call")
      .then(({ sendVoipPush }) => sendVoipPush(targetDeviceId, invite))
      .catch(() => {});
  }

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

  // Reuse a live channel on this topic (re-ring loop collision — see helper).
  const existing = findJoinedChannel(supabase, targetDeviceId);
  if (existing) {
    try {
      const res = await existing.send({
        type: "broadcast",
        event: "call-invite",
        payload: { ...invite, t: Date.now() },
      });
      return res === "ok";
    } catch {
      return false;
    }
  }

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
          // channel.send RESOLVES 'ok' | 'timed out' | 'error' — it does not
          // throw. Treating any resolution as success skipped the PeerJS
          // fallback in exactly the failure cases that matter.
          const res = await channel.send({
            type: "broadcast",
            event: "call-invite",
            payload: { ...invite, t: Date.now() },
          });
          if (res !== "ok") {
            done(false);
            return;
          }
          // Let the message flush before we tear the channel down. NOTE:
          // 'ok' is a SERVER ack — a broadcast to zero joined listeners
          // still acks. The caller-side re-ring loop covers that gap.
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

// "Your invite was claimed" — fired by the invitee's device right after a
// successful first claim so the INVITER gets a live "X just joined — call
// them now" moment while excitement is peak. Realtime-only by design: if
// Realtime is unavailable the inviter still sees the new contact on the next
// list refresh (graceful, not a dead end).
export interface InviteClaimed {
  name: string;
  deviceId: string;
  lang: string;
  t: number;
}

export async function sendInviteClaimed(
  targetDeviceId: string,
  claimed: Omit<InviteClaimed, "t">,
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
            event: "invite-claimed",
            payload: { ...claimed, t: Date.now() },
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

// Send a lightweight control signal (decline / cancel) to a device's ring
// channel so the other side can dismiss its "calling…" / incoming UI.
// Tries Realtime first; falls back to PeerJS when Realtime is unavailable.
export async function sendCallSignal(
  targetDeviceId: string,
  event: "call-declined" | "call-canceled",
  room: string,
): Promise<void> {
  // Persist the dismissal so a callee who missed the realtime signal still
  // clears the ring on its next HTTP pull.
  try {
    void fetch("/api/ring/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ room, toAddress: targetDeviceId, status: "canceled" }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
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

  const existing = findJoinedChannel(supabase, targetDeviceId);
  if (existing) {
    try {
      const res = await existing.send({
        type: "broadcast",
        event,
        payload: { room, t: Date.now() },
      });
      return res === "ok";
    } catch {
      return false;
    }
  }

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
