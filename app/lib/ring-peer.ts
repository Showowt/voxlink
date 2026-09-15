// ═══════════════════════════════════════════════════════════════════════════════
// RING PEER — PeerJS fallback transport for call invites
//
// Realtime broadcast (ring-signal.ts) is the primary ring transport. When it is
// unavailable (e.g. anonymous Realtime disabled on the project), this delivers
// the same call-invite over PeerJS instead — the exact cloud/ICE setup the app
// already uses for talk/group. A device listens as peer `entrevoz-ring-<id>`;
// the caller opens a short data connection and sends the invite.
//
// Only spun up when Realtime fails, so healthy projects pay no always-on cost.
// ═══════════════════════════════════════════════════════════════════════════════

import Peer, { DataConnection } from "peerjs";
import type { CallInvite } from "./ring-signal";

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/turn");
    if (res.ok) {
      const data = await res.json();
      return data.iceServers || DEFAULT_ICE_SERVERS;
    }
  } catch {
    /* fall through to STUN */
  }
  return DEFAULT_ICE_SERVERS;
}

const PEER_SERVER = { host: "0.peerjs.com", port: 443, secure: true, path: "/" };

// PeerJS ids allow [A-Za-z0-9_-]; device ids are UUIDs (already safe).
export function ringPeerId(deviceId: string): string {
  return `entrevoz-ring-${deviceId}`.replace(/[^A-Za-z0-9_-]/g, "");
}

// Listen for incoming ring invites (and control signals like decline/cancel)
// over PeerJS. Returns a cleanup function.
export async function startRingPeerListener(
  deviceId: string,
  onInvite: (invite: CallInvite) => void,
  onSignal?: (event: "call-declined" | "call-canceled", room: string) => void,
): Promise<() => void> {
  const iceServers = await getIceServers();
  let peer: Peer | null = null;
  let destroyed = false;

  try {
    peer = new Peer(ringPeerId(deviceId), {
      ...PEER_SERVER,
      config: { iceServers, iceCandidatePoolSize: 10 },
      debug: 0,
    });
  } catch {
    return () => {};
  }

  peer.on("connection", (conn: DataConnection) => {
    conn.on("data", (raw: unknown) => {
      try {
        const msg = raw as { event?: string; payload?: CallInvite };
        if (msg?.event === "call-invite" && msg.payload?.room) {
          onInvite(msg.payload);
        } else if (
          (msg?.event === "call-declined" || msg?.event === "call-canceled") &&
          msg.payload?.room
        ) {
          onSignal?.(msg.event, msg.payload.room);
        }
      } catch {
        /* ignore malformed */
      }
      // A ring is one-shot — close shortly after receiving.
      setTimeout(() => {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
      }, 500);
    });
  });

  peer.on("error", (err: { type?: string }) => {
    // `unavailable-id` = another tab/instance already holds this ring id — fine,
    // it will handle invites. Other errors: leave the peer; PeerJS self-retries.
    if (err?.type === "unavailable-id" && !destroyed) {
      destroyed = true;
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
      peer = null;
    }
  });

  return () => {
    destroyed = true;
    try {
      peer?.destroy();
    } catch {
      /* ignore */
    }
    peer = null;
  };
}

// Send a call invite to a target device over PeerJS. Resolves true if the
// invite was handed to an open data connection.
export async function sendCallInvitePeer(
  targetDeviceId: string,
  invite: Omit<CallInvite, "t">,
): Promise<boolean> {
  if (!targetDeviceId) return false;
  const iceServers = await getIceServers();

  return new Promise<boolean>((resolve) => {
    let peer: Peer | null = null;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    try {
      peer = new Peer({
        ...PEER_SERVER,
        config: { iceServers, iceCandidatePoolSize: 10 },
        debug: 0,
      });
    } catch {
      return resolve(false);
    }

    peer.on("open", () => {
      const conn = peer!.connect(ringPeerId(targetDeviceId), { reliable: true });
      conn.on("open", () => {
        try {
          conn.send({ event: "call-invite", payload: { ...invite, t: Date.now() } });
          setTimeout(() => done(true), 800); // let it flush
        } catch {
          done(false);
        }
      });
      conn.on("error", () => done(false));
    });
    // Target isn't listening / not reachable.
    peer.on("error", () => done(false));

    setTimeout(() => done(false), 6000); // hard cap
  });
}

// Deliver a control signal (decline / cancel) to a device over PeerJS —
// fallback for when Realtime broadcast is unavailable.
export async function sendCallSignalPeer(
  targetDeviceId: string,
  event: "call-declined" | "call-canceled",
  room: string,
): Promise<boolean> {
  if (!targetDeviceId) return false;
  const iceServers = await getIceServers();

  return new Promise<boolean>((resolve) => {
    let peer: Peer | null = null;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    try {
      peer = new Peer({
        ...PEER_SERVER,
        config: { iceServers, iceCandidatePoolSize: 10 },
        debug: 0,
      });
    } catch {
      return resolve(false);
    }

    peer.on("open", () => {
      const conn = peer!.connect(ringPeerId(targetDeviceId), { reliable: true });
      conn.on("open", () => {
        try {
          conn.send({ event, payload: { room, t: Date.now() } });
          setTimeout(() => done(true), 800);
        } catch {
          done(false);
        }
      });
      conn.on("error", () => done(false));
    });
    peer.on("error", () => done(false));

    setTimeout(() => done(false), 6000);
  });
}
