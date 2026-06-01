// ═══════════════════════════════════════════════════════════════════════════════
// ROOM SIGNALING v2 — Full WebRTC signaling through Supabase Realtime
// Handles peer discovery + SDP offer/answer + ICE candidate exchange.
// Eliminates dependency on PeerJS cloud server (0.peerjs.com).
// ═══════════════════════════════════════════════════════════════════════════════

import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface RoomSignalCallbacks {
  /** Remote peer announced presence */
  onPeerPresent?: (role: "host" | "guest") => void;
  /** Received SDP offer from remote peer */
  onOffer?: (sdp: RTCSessionDescriptionInit) => void;
  /** Received SDP answer from remote peer */
  onAnswer?: (sdp: RTCSessionDescriptionInit) => void;
  /** Received ICE candidate from remote peer */
  onCandidate?: (candidate: RTCIceCandidateInit) => void;
  /** Remote peer left the room */
  onPeerLeft?: () => void;
  /** Legacy: host PeerJS ID discovered (for talk-connection.ts compat) */
  onHostPeerId?: (peerId: string) => void;
  /** Legacy: guest PeerJS ID discovered (for talk-connection.ts compat) */
  onGuestPeerId?: (peerId: string) => void;
}

export class RoomSignal {
  private channel: RealtimeChannel | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private destroyed = false;
  private role: "host" | "guest" = "host";
  private currentPeerId = "";

  get isActive(): boolean {
    return !this.destroyed && this.channel !== null;
  }

  /**
   * Start signaling. Can be called with 3 args (new API) or 4 args (legacy compat for talk-connection).
   * Legacy: start(roomCode, role, peerId, callbacks)
   * New:    start(roomCode, role, callbacks)
   */
  async start(
    roomCode: string,
    role: "host" | "guest",
    callbacksOrPeerId: RoomSignalCallbacks | string,
    legacyCallbacks?: RoomSignalCallbacks,
  ): Promise<boolean> {
    // Handle legacy 4-arg signature: start(roomCode, role, peerId, callbacks)
    let callbacks: RoomSignalCallbacks;
    if (typeof callbacksOrPeerId === "string") {
      this.currentPeerId = callbacksOrPeerId;
      callbacks = legacyCallbacks || {};
    } else {
      callbacks = callbacksOrPeerId;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      console.error("[RoomSignal] Supabase not configured — cannot signal");
      return false;
    }

    this.role = role;
    this.destroyed = false;

    try {
      const channelName = `call-${roomCode.toUpperCase()}`;

      this.channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      // ── Presence heartbeat ──────────────────────────────────────────────
      this.channel.on("broadcast", { event: "presence" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        const peerRole = data.role as "host" | "guest";
        if (peerRole && peerRole !== this.role) {
          callbacks.onPeerPresent?.(peerRole);
        }
      });

      // ── Legacy peer ID discovery (for talk-connection PeerJS compat) ────
      this.channel.on("broadcast", { event: "peer" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        const peerRole = data.role as string;
        const peerId = data.peerId as string;
        if (!peerId) return;
        if (peerRole === "host") callbacks.onHostPeerId?.(peerId);
        else if (peerRole === "guest") callbacks.onGuestPeerId?.(peerId);
      });

      // ── SDP offer ───────────────────────────────────────────────────────
      this.channel.on("broadcast", { event: "offer" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        if (data.target !== this.role) return; // Not for us
        const sdp = data.sdp as RTCSessionDescriptionInit;
        if (sdp) {
          console.log("[RoomSignal] Received offer");
          callbacks.onOffer?.(sdp);
        }
      });

      // ── SDP answer ──────────────────────────────────────────────────────
      this.channel.on("broadcast", { event: "answer" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        if (data.target !== this.role) return;
        const sdp = data.sdp as RTCSessionDescriptionInit;
        if (sdp) {
          console.log("[RoomSignal] Received answer");
          callbacks.onAnswer?.(sdp);
        }
      });

      // ── ICE candidate ───────────────────────────────────────────────────
      this.channel.on("broadcast", { event: "candidate" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        if (data.target !== this.role) return;
        const candidate = data.candidate as RTCIceCandidateInit;
        if (candidate) {
          callbacks.onCandidate?.(candidate);
        }
      });

      // ── Peer left ───────────────────────────────────────────────────────
      this.channel.on("broadcast", { event: "leave" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        if (data.role !== this.role) {
          console.log("[RoomSignal] Peer left");
          callbacks.onPeerLeft?.();
        }
      });

      await this.channel.subscribe();

      // Broadcast presence immediately + heartbeat every 3s
      this.broadcastPresence();
      if (this.currentPeerId) this.broadcastPeerId();
      this.heartbeat = setInterval(() => {
        this.broadcastPresence();
        if (this.currentPeerId) this.broadcastPeerId();
      }, 3000);

      console.log(`[RoomSignal] Active on channel ${channelName} as ${role}`);
      return true;
    } catch (err) {
      console.error("[RoomSignal] Failed to start:", err);
      return false;
    }
  }

  // ── Sending methods ─────────────────────────────────────────────────────

  private broadcastPresence(): void {
    if (this.destroyed || !this.channel) return;
    this.channel.send({
      type: "broadcast",
      event: "presence",
      payload: { role: this.role, t: Date.now() },
    });
  }

  /** Legacy: update PeerJS peer ID and broadcast (for talk-connection.ts) */
  updatePeerId(newPeerId: string): void {
    this.currentPeerId = newPeerId;
    this.broadcastPeerId();
  }

  private broadcastPeerId(): void {
    if (this.destroyed || !this.channel || !this.currentPeerId) return;
    this.channel.send({
      type: "broadcast",
      event: "peer",
      payload: { role: this.role, peerId: this.currentPeerId, t: Date.now() },
    });
  }

  sendOffer(sdp: RTCSessionDescriptionInit): void {
    if (this.destroyed || !this.channel) return;
    const target = this.role === "guest" ? "host" : "guest";
    console.log("[RoomSignal] Sending offer to", target);
    this.channel.send({
      type: "broadcast",
      event: "offer",
      payload: { sdp, target, from: this.role, t: Date.now() },
    });
  }

  sendAnswer(sdp: RTCSessionDescriptionInit): void {
    if (this.destroyed || !this.channel) return;
    const target = this.role === "guest" ? "host" : "guest";
    console.log("[RoomSignal] Sending answer to", target);
    this.channel.send({
      type: "broadcast",
      event: "answer",
      payload: { sdp, target, from: this.role, t: Date.now() },
    });
  }

  sendCandidate(candidate: RTCIceCandidateInit): void {
    if (this.destroyed || !this.channel) return;
    const target = this.role === "guest" ? "host" : "guest";
    this.channel.send({
      type: "broadcast",
      event: "candidate",
      payload: { candidate, target, from: this.role, t: Date.now() },
    });
  }

  sendLeave(): void {
    if (this.destroyed || !this.channel) return;
    this.channel.send({
      type: "broadcast",
      event: "leave",
      payload: { role: this.role, t: Date.now() },
    });
  }

  stop(): void {
    if (!this.destroyed) {
      this.sendLeave();
    }
    this.destroyed = true;
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.channel) {
      try {
        this.channel.unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
      this.channel = null;
    }
  }
}
