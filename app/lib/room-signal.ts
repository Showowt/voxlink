// ═══════════════════════════════════════════════════════════════════════════════
// ROOM SIGNALING — Supabase Realtime peer discovery
// Eliminates dependency on PeerJS public server for finding peers.
// Both sides broadcast their PeerJS peer ID through Supabase Realtime,
// so the guest always knows the host's actual ID — even if the host
// had to fall back to a random ID due to stale sessions on PeerJS.
// ═══════════════════════════════════════════════════════════════════════════════

import { createBrowserClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface RoomSignalCallbacks {
  onHostPeerId?: (peerId: string) => void;
  onGuestPeerId?: (peerId: string) => void;
}

export class RoomSignal {
  private channel: RealtimeChannel | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private destroyed = false;
  private role: "host" | "guest" = "host";
  private currentPeerId = "";

  async start(
    roomCode: string,
    role: "host" | "guest",
    myPeerId: string,
    callbacks: RoomSignalCallbacks,
  ): Promise<boolean> {
    const supabase = createBrowserClient();
    if (!supabase) {
      console.warn("[RoomSignal] Supabase not configured — falling back to PeerJS-only");
      return false;
    }

    this.role = role;
    this.currentPeerId = myPeerId;
    this.destroyed = false;

    try {
      const channelName = `call-${roomCode.toUpperCase()}`;

      this.channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      // Listen for peer signals
      this.channel.on("broadcast", { event: "peer" }, (payload) => {
        if (this.destroyed) return;
        const data = payload.payload as Record<string, unknown>;
        const peerRole = data.role as string;
        const peerId = data.peerId as string;

        if (!peerId) return;

        if (peerRole === "host") {
          console.log("[RoomSignal] Discovered host:", peerId);
          callbacks.onHostPeerId?.(peerId);
        } else if (peerRole === "guest") {
          console.log("[RoomSignal] Discovered guest:", peerId);
          callbacks.onGuestPeerId?.(peerId);
        }
      });

      await this.channel.subscribe();

      // Broadcast immediately + heartbeat every 3s
      this.broadcast();
      this.heartbeat = setInterval(() => this.broadcast(), 3000);

      console.log(`[RoomSignal] Active on channel ${channelName} as ${role}`);
      return true;
    } catch (err) {
      console.warn("[RoomSignal] Failed to start:", err);
      return false;
    }
  }

  /** Update our peer ID (e.g., after PeerJS rebuild) and broadcast immediately */
  updatePeerId(newPeerId: string): void {
    this.currentPeerId = newPeerId;
    this.broadcast();
  }

  private broadcast(): void {
    if (this.destroyed || !this.channel) return;
    this.channel.send({
      type: "broadcast",
      event: "peer",
      payload: {
        role: this.role,
        peerId: this.currentPeerId,
        t: Date.now(),
      },
    });
  }

  stop(): void {
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
