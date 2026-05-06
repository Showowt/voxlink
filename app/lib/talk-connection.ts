import Peer, { DataConnection } from "peerjs";
import { RoomSignal } from "./room-signal";

// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ TALK CONNECTION v2.0 - Bulletproof Face-to-Face Mode
// Fixed: Connection reliability, handshake timing, peer discovery
// ═══════════════════════════════════════════════════════════════════════════════

export type TalkConnectionStatus =
  | "initializing"
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "room_full";

export interface TalkMessage {
  type:
    | "message"
    | "live"
    | "presence"
    | "emoji"
    | "clear"
    | "ping"
    | "pong"
    | "room_full";
  data: Record<string, unknown>;
  messageId?: string;
}

export interface TalkPartnerInfo {
  name: string;
  lang?: string;
  deviceId?: string;
}

export interface TalkConnectionCallbacks {
  onStatusChange?: (status: TalkConnectionStatus, message?: string) => void;
  onMessage?: (message: TalkMessage) => void;
  onPartnerConnected?: (name: string, lang?: string) => void;
  onPartnerInfo?: (info: TalkPartnerInfo) => void;
  onPartnerDisconnected?: () => void;
}

// Default ICE servers (STUN only - TURN fetched from API)
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

// Fetch ICE servers from secure API (includes TURN credentials)
async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/turn");
    if (res.ok) {
      const data = await res.json();
      return data.iceServers || DEFAULT_ICE_SERVERS;
    }
  } catch (err) {
    console.warn("[Entrevoz] Failed to fetch TURN credentials:", err);
  }
  return DEFAULT_ICE_SERVERS;
}

export class TalkConnection {
  private peer: Peer | null = null;
  private dataConnection: DataConnection | null = null;
  private _status: TalkConnectionStatus = "initializing";
  private _isHost: boolean = false;
  private _peerId: string = "";
  private _hostPeerId: string = "";
  private _partnerName: string = "";
  private _partnerLang: string = "";
  private _userName: string = "";
  private _userLang: string = "";
  private _deviceId: string = "";
  private roomId: string = "";

  private callbacks: TalkConnectionCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionAttemptInterval: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  // Supabase room signaling
  private roomSignal: RoomSignal | null = null;
  private signalingHealthCheck: NodeJS.Timeout | null = null;

  // Track connection health
  private lastPongTime: number = Date.now();
  private connectionHealthy: boolean = false;

  constructor(callbacks?: TalkConnectionCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  get status(): TalkConnectionStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === "connected" && this.connectionHealthy;
  }

  get partnerName(): string {
    return this._partnerName;
  }

  async initialize(
    roomId: string,
    isHost: boolean,
    userName: string,
    userLang: string = "en",
    deviceId: string = "",
  ): Promise<boolean> {
    this._isHost = isHost;
    this._userName = userName;
    this._userLang = userLang;
    this._deviceId = deviceId;
    this.roomId = roomId.toUpperCase(); // Normalize to uppercase
    this.isDestroyed = false;

    // Deterministic host ID (fast path for fresh rooms)
    this._hostPeerId = `entrevoz-${this.roomId}-host`;

    if (isHost) {
      this._peerId = this._hostPeerId;
    } else {
      const uniqueId = Math.random().toString(36).substring(2, 8);
      this._peerId = `entrevoz-${this.roomId}-guest-${uniqueId}`;
    }

    this.setStatus("initializing", "Connecting to server...");

    try {
      const iceServers = await getIceServers();

      const servers = [
        { host: "0.peerjs.com", port: 443, secure: true, path: "/" },
      ];

      let connected = false;
      let lastError: Error | null = null;
      const maxIdRetries = isHost ? 3 : 1;

      for (let idAttempt = 0; idAttempt < maxIdRetries && !connected; idAttempt++) {
        if (idAttempt > 0) {
          console.log(`[Entrevoz] Host ID taken, waiting 2s before retry ${idAttempt + 1}/${maxIdRetries}...`);
          this.setStatus("initializing", "Reconnecting...");
          await new Promise((r) => setTimeout(r, 2000));
          if (this.isDestroyed) return false;
        }

        for (let i = 0; i < servers.length && !connected; i++) {
          const server = servers[i];
          console.log(`[Entrevoz] Trying ${server.host} as: ${this._peerId}`);

          try {
            this.peer = new Peer(this._peerId, {
              host: server.host,
              port: server.port,
              secure: server.secure,
              path: server.path,
              config: { iceServers, iceCandidatePoolSize: 10 },
              debug: 1,
            });

            await this.waitForPeerOpen();
            console.log(`[Entrevoz] Connected via ${server.host} as:`, this._peerId);
            connected = true;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const errType = (err as { type?: string })?.type;
            console.warn(`[Entrevoz] Server ${server.host} failed:`, errMsg);
            lastError = err instanceof Error ? err : new Error(String(err));

            if (this.peer) {
              try { this.peer.destroy(); } catch { /* ignore */ }
              this.peer = null;
            }

            if (isHost && (errType === "unavailable-id" || errMsg.includes("already in use"))) {
              break;
            }
          }
        }
      }

      // HOST FALLBACK: Random ID if deterministic ID was stale
      if (!connected && isHost) {
        const randomId = Math.random().toString(36).substring(2, 8);
        this._peerId = `ev-${this.roomId}-th-${randomId}`;
        console.log("[Entrevoz] Stale ID — switching to random:", this._peerId);
        this.setStatus("initializing", "Reconnecting...");

        for (let i = 0; i < servers.length && !connected; i++) {
          const server = servers[i];
          try {
            this.peer = new Peer(this._peerId, {
              host: server.host,
              port: server.port,
              secure: server.secure,
              path: server.path,
              config: { iceServers, iceCandidatePoolSize: 10 },
              debug: 1,
            });
            await this.waitForPeerOpen();
            console.log("[Entrevoz] Connected with random ID:", this._peerId);
            connected = true;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (this.peer) {
              try { this.peer.destroy(); } catch { /* ignore */ }
              this.peer = null;
            }
          }
        }
      }

      if (!connected) {
        throw lastError || new Error("All signaling servers failed");
      }

      this.setupPeerListeners();

      // Supabase room signaling — broadcast our peer ID
      this.roomSignal = new RoomSignal();
      await this.roomSignal.start(
        this.roomId,
        isHost ? "host" : "guest",
        this._peerId,
        {
          onHostPeerId: (peerId) => {
            if (this._isHost || this.isDestroyed) return;
            if (peerId !== this._hostPeerId) {
              console.log("[Entrevoz] Supabase: host peer ID updated:", peerId);
              this._hostPeerId = peerId;
            }
            if (this._status !== "connected") {
              this.startConnectionAttempts();
            }
          },
          onGuestPeerId: () => { /* host sees guest — logged in RoomSignal */ },
        },
      );

      if (isHost) {
        this.setStatus("waiting", "Share the link - waiting for partner...");
        // Self-healing: rebuild PeerJS if signaling drops
        this.startSignalingHealthCheck(iceServers, servers[0]);
      } else {
        this.setStatus("connecting", "Looking for host...");
        this.startConnectionAttempts();
      }

      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      console.error("[Entrevoz] Initialization error:", error);
      this.setStatus("failed", errorMessage);
      return false;
    }
  }

  private waitForPeerOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error("Peer not created"));
        return;
      }

      if (this.peer.open) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout - please refresh and try again"));
      }, 20000);

      this.peer.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.peer.on("error", (error) => {
        clearTimeout(timeout);
        // Handle ID taken error
        if (error.type === "unavailable-id") {
          reject(new Error("Room already in use - try a different code"));
        } else {
          reject(error);
        }
      });
    });
  }

  private setupPeerListeners(): void {
    if (!this.peer) return;

    // Handle incoming connections (host receives these)
    this.peer.on("connection", (conn) => {
      console.log("[Entrevoz] Incoming connection from:", conn.peer);

      // Check if host already has a connected partner
      if (this._isHost && this.dataConnection?.open && this.connectionHealthy) {
        console.log(
          "[Entrevoz] Room full - rejecting new connection:",
          conn.peer,
        );
        // Send room_full message to the new joiner and close their connection
        conn.on("open", () => {
          conn.send({ type: "room_full", data: {} });
          setTimeout(() => {
            try {
              conn.close();
            } catch {
              // Ignore close errors
            }
          }, 100);
        });
        return;
      }

      // Clean up any existing connection (only if not healthy/open)
      if (this.dataConnection && this.dataConnection.peer !== conn.peer) {
        this.cleanupDataConnection();
      }

      this.setupDataConnection(conn);
    });

    this.peer.on("error", (error: { type: string; message?: string }) => {
      console.error("[Entrevoz] Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable") {
        // Host not found yet - guest keeps trying
        if (!this._isHost && !this.isDestroyed) {
          console.log("[Entrevoz] Host not found, will retry...");
        }
      } else if (error.type === "unavailable-id") {
        // Handled by retry logic in initialize() — don't fail here
        console.warn("[Entrevoz] Peer ID taken, retry logic will handle");
      } else if (this._status !== "connected" && !this.isDestroyed) {
        this.attemptReconnect();
      }
    });

    this.peer.on("disconnected", () => {
      console.log("[Entrevoz] Disconnected from signaling server");
      if (!this.isDestroyed && this.peer) {
        // Try to reconnect to signaling server
        setTimeout(() => {
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          }
        }, 1000);
      }
    });

    this.peer.on("close", () => {
      console.log("[Entrevoz] Peer connection closed");
    });
  }

  // Guest repeatedly tries to connect to host
  private startConnectionAttempts(): void {
    this.stopConnectionAttempts();

    let attempts = 0;
    const maxAttempts = 30;
    const FAST_RETRIES = 6; // First 6 at 500ms
    const FAST_DELAY = 500;
    const SLOW_DELAY = 2000;

    const tryConnect = () => {
      if (this.isDestroyed || this._status === "connected") {
        this.stopConnectionAttempts();
        return;
      }

      attempts++;
      if (attempts > maxAttempts) {
        this.setStatus("failed", "Could not find host - ask them to refresh");
        return;
      }

      console.log(`[Entrevoz] Connection attempt ${attempts}/${maxAttempts}`);
      this.connectToHost();

      // Fast retries first, then slow
      const delay = attempts <= FAST_RETRIES ? FAST_DELAY : SLOW_DELAY;
      this.connectionAttemptInterval = setTimeout(tryConnect, delay);
    };

    // Try immediately
    tryConnect();
  }

  private stopConnectionAttempts(): void {
    if (this.connectionAttemptInterval) {
      clearTimeout(this.connectionAttemptInterval);
      this.connectionAttemptInterval = null;
    }
  }

  private connectToHost(): void {
    if (!this.peer || this.isDestroyed) {
      return;
    }

    if (!this.peer.open) {
      console.log("[Entrevoz] Peer not open yet, waiting...");
      return;
    }

    // Don't create new connection if we have an active one
    if (this.dataConnection?.open) {
      console.log("[Entrevoz] Already connected, skipping");
      return;
    }

    console.log("[Entrevoz] Connecting to host:", this._hostPeerId);

    try {
      const conn = this.peer.connect(this._hostPeerId, {
        reliable: true,
        serialization: "json",
      });

      this.setupDataConnection(conn);
    } catch (error) {
      console.error("[Entrevoz] Connect error:", error);
    }
  }

  private cleanupDataConnection(): void {
    this.connectionHealthy = false;
    this.stopKeepAlive();

    if (this.dataConnection) {
      try {
        this.dataConnection.close();
      } catch {
        // Ignore cleanup errors
      }
      this.dataConnection = null;
    }
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnection = conn;
    this.connectionHealthy = false;

    conn.on("open", () => {
      console.log("[Entrevoz] Data channel OPEN with:", conn.peer);

      this.stopConnectionAttempts();
      this.reconnectAttempts = 0;
      this.connectionHealthy = true;
      this.lastPongTime = Date.now();

      // Send presence immediately
      this.sendPresence();

      // Start keepalive
      this.startKeepAlive();

      // Update status
      this.setStatus("connected", "Connected!");
    });

    conn.on("data", (data: unknown) => {
      this.handleIncomingData(data);
    });

    conn.on("close", () => {
      console.log("[Entrevoz] Data channel closed");
      this.connectionHealthy = false;
      this.stopKeepAlive();
      this._partnerName = "";
      this.callbacks.onPartnerDisconnected?.();

      if (this._status === "connected" && !this.isDestroyed) {
        this.setStatus("reconnecting", "Partner disconnected...");
        this.attemptReconnect();
      }
    });

    conn.on("error", (error) => {
      console.error("[Entrevoz] Data channel error:", error);
    });
  }

  private sendPresence(): void {
    this.directSend({
      type: "presence",
      data: {
        name: this._userName,
        lang: this._userLang,
        deviceId: this._deviceId,
        role: this._isHost ? "host" : "guest",
      },
    });
  }

  private handleIncomingData(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const message = data as TalkMessage;

    // Room full message - 3rd person trying to join
    if (message.type === "room_full") {
      console.log("[Entrevoz] Room is full - cannot join");
      this.stopConnectionAttempts();
      this.setStatus(
        "room_full",
        "This room is full. Only 2 participants allowed.",
      );
      return;
    }

    // Update connection health on any received data
    this.lastPongTime = Date.now();
    this.connectionHealthy = true;

    switch (message.type) {
      case "ping":
        this.directSend({ type: "pong", data: { timestamp: Date.now() } });
        return;

      case "pong":
        this.lastPongTime = Date.now();
        this.connectionHealthy = true;
        return;

      case "presence":
        this.handlePresence(message.data);
        return;

      default:
        // Pass to callback
        this.callbacks.onMessage?.(message);
    }
  }

  private handlePresence(presenceData: Record<string, unknown>): void {
    const name = String(presenceData.name || "Partner");
    const lang = String(presenceData.lang || "");
    const deviceId = presenceData.deviceId ? String(presenceData.deviceId) : undefined;
    console.log("[Entrevoz] Partner presence:", name, "lang:", lang);

    this._partnerName = name;
    this._partnerLang = lang;
    this.callbacks.onPartnerConnected?.(name, lang);
    this.callbacks.onPartnerInfo?.({ name, lang: lang || undefined, deviceId });

    // Send presence back if we haven't yet
    this.sendPresence();
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();

    this.keepAliveInterval = setInterval(() => {
      if (!this.dataConnection?.open) {
        this.stopKeepAlive();
        return;
      }

      // Check connection health
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > 15000) {
        console.warn("[Entrevoz] No response for 15s, connection may be dead");
        this.connectionHealthy = false;
      }

      // Send ping
      this.directSend({ type: "ping", data: { timestamp: Date.now() } });
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus("failed", "Connection failed - please refresh");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      1000 * Math.pow(1.3, this.reconnectAttempts - 1),
      8000,
    );

    this.setStatus(
      "reconnecting",
      `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (this.isDestroyed) return;

      if (this._isHost) {
        // Host waits for guest to reconnect
        this.setStatus("waiting", "Waiting for partner to reconnect...");
      } else {
        // Guest tries to reconnect
        this.startConnectionAttempts();
      }
    }, delay);
  }

  private directSend(message: TalkMessage): boolean {
    if (!this.dataConnection?.open) {
      return false;
    }

    try {
      this.dataConnection.send(message);
      return true;
    } catch (error) {
      console.error("[Entrevoz] Send error:", error);
      return false;
    }
  }

  send(message: TalkMessage): boolean {
    // Generate message ID for tracking
    if (
      !message.messageId &&
      (message.type === "message" || message.type === "live")
    ) {
      message.messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    return this.directSend(message);
  }

  private setStatus(status: TalkConnectionStatus, message?: string): void {
    this._status = status;
    console.log("[Entrevoz] Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }

  // Self-healing: monitor PeerJS signaling and rebuild if it drops
  private startSignalingHealthCheck(
    iceServers: RTCIceServer[],
    server: { host: string; port: number; secure: boolean; path: string },
  ): void {
    if (this.signalingHealthCheck) clearInterval(this.signalingHealthCheck);

    this.signalingHealthCheck = setInterval(async () => {
      if (this.isDestroyed) {
        if (this.signalingHealthCheck) clearInterval(this.signalingHealthCheck);
        return;
      }
      if (this._status === "connected") return;

      if (!this.peer || this.peer.destroyed || !this.peer.open) {
        console.warn("[Entrevoz] PeerJS signaling dead — rebuilding...");
        if (this.peer) {
          try { this.peer.destroy(); } catch { /* ignore */ }
          this.peer = null;
        }

        const randomId = Math.random().toString(36).substring(2, 8);
        this._peerId = this._isHost
          ? `ev-${this.roomId}-th-${randomId}`
          : `ev-${this.roomId}-tg-${randomId}`;

        try {
          this.peer = new Peer(this._peerId, {
            host: server.host,
            port: server.port,
            secure: server.secure,
            path: server.path,
            config: { iceServers, iceCandidatePoolSize: 10 },
            debug: 1,
          });
          await this.waitForPeerOpen();
          this.setupPeerListeners();
          this.roomSignal?.updatePeerId(this._peerId);
          console.log("[Entrevoz] Peer rebuilt:", this._peerId);
        } catch (err) {
          console.error("[Entrevoz] Rebuild failed:", err);
        }
      }
    }, 8000);
  }

  disconnect(): void {
    console.log("[Entrevoz] Disconnecting...");
    this.isDestroyed = true;

    this.stopKeepAlive();
    this.stopConnectionAttempts();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.signalingHealthCheck) {
      clearInterval(this.signalingHealthCheck);
      this.signalingHealthCheck = null;
    }

    if (this.roomSignal) {
      this.roomSignal.stop();
      this.roomSignal = null;
    }

    this.cleanupDataConnection();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }

    this.reconnectAttempts = 0;
    this.connectionHealthy = false;
  }
}
