import Peer, { DataConnection } from "peerjs";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK TALK CONNECTION v2.0 - Bulletproof Face-to-Face Mode
// Fixed: Connection reliability, handshake timing, peer discovery
// ═══════════════════════════════════════════════════════════════════════════════

export type TalkConnectionStatus =
  | "initializing"
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface TalkMessage {
  type: "message" | "live" | "presence" | "emoji" | "clear" | "ping" | "pong";
  data: Record<string, unknown>;
  messageId?: string;
}

export interface TalkConnectionCallbacks {
  onStatusChange?: (status: TalkConnectionStatus, message?: string) => void;
  onMessage?: (message: TalkMessage) => void;
  onPartnerConnected?: (name: string) => void;
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
    console.warn("[VoxLink] Failed to fetch TURN credentials:", err);
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
  private _userName: string = "";
  private roomId: string = "";

  private callbacks: TalkConnectionCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionAttemptInterval: NodeJS.Timeout | null = null;
  private isDestroyed = false;

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
  ): Promise<boolean> {
    this._isHost = isHost;
    this._userName = userName;
    this.roomId = roomId.toUpperCase(); // Normalize to uppercase
    this.isDestroyed = false;

    // Generate peer IDs
    // Host: stable ID so guests can find them
    // Guest: unique ID with timestamp
    this._hostPeerId = `voxlink-${this.roomId}-host`;

    if (isHost) {
      this._peerId = this._hostPeerId;
    } else {
      // Guest needs unique ID to avoid conflicts
      const uniqueId = Math.random().toString(36).substring(2, 8);
      this._peerId = `voxlink-${this.roomId}-guest-${uniqueId}`;
    }

    this.setStatus("initializing", "Connecting to server...");

    try {
      // Fetch ICE servers (TURN credentials from server)
      const iceServers = await getIceServers();

      // Create peer with explicit PeerJS cloud configuration
      this.peer = new Peer(this._peerId, {
        // Use PeerJS cloud with explicit config
        host: "0.peerjs.com",
        port: 443,
        secure: true,
        path: "/",
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
        },
        debug: 2, // More verbose logging for debugging
      });

      await this.waitForPeerOpen();
      console.log("[VoxLink] Connected to PeerJS server as:", this._peerId);

      this.setupPeerListeners();

      if (isHost) {
        this.setStatus("waiting", "Share the link - waiting for partner...");
      } else {
        this.setStatus("connecting", "Looking for host...");
        // Start attempting to connect to host
        this.startConnectionAttempts();
      }

      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      console.error("[VoxLink] Initialization error:", error);
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
      console.log("[VoxLink] Incoming connection from:", conn.peer);

      // Clean up any existing connection
      if (this.dataConnection && this.dataConnection.peer !== conn.peer) {
        this.cleanupDataConnection();
      }

      this.setupDataConnection(conn);
    });

    this.peer.on("error", (error: { type: string; message?: string }) => {
      console.error("[VoxLink] Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable") {
        // Host not found yet - guest keeps trying
        if (!this._isHost && !this.isDestroyed) {
          console.log("[VoxLink] Host not found, will retry...");
        }
      } else if (error.type === "unavailable-id") {
        // Our ID is taken - for host this is a problem
        if (this._isHost) {
          this.setStatus("failed", "Room code in use - try a new code");
        }
      } else if (this._status !== "connected" && !this.isDestroyed) {
        this.attemptReconnect();
      }
    });

    this.peer.on("disconnected", () => {
      console.log("[VoxLink] Disconnected from signaling server");
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
      console.log("[VoxLink] Peer connection closed");
    });
  }

  // Guest repeatedly tries to connect to host
  private startConnectionAttempts(): void {
    this.stopConnectionAttempts();

    let attempts = 0;
    const maxAttempts = 30; // Try for 1 minute

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

      console.log(`[VoxLink] Connection attempt ${attempts}/${maxAttempts}`);
      this.connectToHost();
    };

    // Try immediately
    tryConnect();

    // Then retry every 2 seconds
    this.connectionAttemptInterval = setInterval(tryConnect, 2000);
  }

  private stopConnectionAttempts(): void {
    if (this.connectionAttemptInterval) {
      clearInterval(this.connectionAttemptInterval);
      this.connectionAttemptInterval = null;
    }
  }

  private connectToHost(): void {
    if (!this.peer || this.isDestroyed) {
      return;
    }

    if (!this.peer.open) {
      console.log("[VoxLink] Peer not open yet, waiting...");
      return;
    }

    // Don't create new connection if we have an active one
    if (this.dataConnection?.open) {
      console.log("[VoxLink] Already connected, skipping");
      return;
    }

    console.log("[VoxLink] Connecting to host:", this._hostPeerId);

    try {
      const conn = this.peer.connect(this._hostPeerId, {
        reliable: true,
        serialization: "json",
      });

      this.setupDataConnection(conn);
    } catch (error) {
      console.error("[VoxLink] Connect error:", error);
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
      console.log("[VoxLink] Data channel OPEN with:", conn.peer);

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
      console.log("[VoxLink] Data channel closed");
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
      console.error("[VoxLink] Data channel error:", error);
    });
  }

  private sendPresence(): void {
    this.directSend({
      type: "presence",
      data: {
        name: this._userName,
        role: this._isHost ? "host" : "guest",
      },
    });
  }

  private handleIncomingData(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const message = data as TalkMessage;

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
    console.log("[VoxLink] Partner presence:", name);

    this._partnerName = name;
    this.callbacks.onPartnerConnected?.(name);

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
        console.warn("[VoxLink] No response for 15s, connection may be dead");
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
      console.error("[VoxLink] Send error:", error);
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
    console.log("[VoxLink] Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }

  disconnect(): void {
    console.log("[VoxLink] Disconnecting...");
    this.isDestroyed = true;

    this.stopKeepAlive();
    this.stopConnectionAttempts();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
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
