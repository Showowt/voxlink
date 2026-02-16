import Peer, { DataConnection } from "peerjs";

// ═══════════════════════════════════════════════════════════════════════════════
// TALK CONNECTION - Real-time data sync for Face-to-Face mode
// Uses PeerJS data channels for cross-device communication
// FIXED: Bidirectional connection issues, message queuing, proper handshake
// ═══════════════════════════════════════════════════════════════════════════════

export type TalkConnectionStatus =
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface TalkMessage {
  type:
    | "message"
    | "live"
    | "presence"
    | "emoji"
    | "clear"
    | "ping"
    | "pong"
    | "sync-request"
    | "sync-ack";
  data: any;
}

export interface TalkConnectionCallbacks {
  onStatusChange?: (status: TalkConnectionStatus, message?: string) => void;
  onMessage?: (message: TalkMessage) => void;
  onPartnerConnected?: (name: string) => void;
  onPartnerDisconnected?: () => void;
}

// COMPREHENSIVE ICE SERVERS - Optimized for Latin America / Colombia
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN - highly reliable globally
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },

  // Twilio STUN - excellent global coverage
  { urls: "stun:global.stun.twilio.com:3478" },

  // Additional public STUN servers for redundancy
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.voip.eutelia.it:3478" },

  // OpenRelay TURN - Free, works globally
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  // TCP fallback (works on restrictive mobile networks like Claro/Tigo)
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },

  // Additional TURN for redundancy
  {
    urls: "turn:relay.metered.ca:80",
    username: "e8dd65b92c62d5e91f3ce421",
    credential: "uWdWNmkhvyqTmFGp",
  },
  {
    urls: "turn:relay.metered.ca:443",
    username: "e8dd65b92c62d5e91f3ce421",
    credential: "uWdWNmkhvyqTmFGp",
  },
  {
    urls: "turn:relay.metered.ca:443?transport=tcp",
    username: "e8dd65b92c62d5e91f3ce421",
    credential: "uWdWNmkhvyqTmFGp",
  },
];

export class TalkConnection {
  private peer: Peer | null = null;
  private dataConnection: DataConnection | null = null;
  private _status: TalkConnectionStatus = "connecting";
  private _isHost: boolean = false;
  private _peerId: string = "";
  private _remotePeerId: string = "";
  private _partnerName: string = "";
  private _userName: string = "";
  private roomId: string = "";

  private callbacks: TalkConnectionCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isReconnecting = false;

  // NEW: Message queue for reliability
  private messageQueue: TalkMessage[] = [];
  private isConnectionOpen = false;
  private syncVerified = false;
  private syncTimeout: NodeJS.Timeout | null = null;

  constructor(callbacks?: TalkConnectionCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks;
    }
  }

  get status(): TalkConnectionStatus {
    return this._status;
  }
  get isConnected(): boolean {
    return (
      this._status === "connected" && this.isConnectionOpen && this.syncVerified
    );
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
    this.roomId = roomId;

    // Use simpler peer IDs to avoid conflicts
    const timestamp = Date.now();
    this._peerId = isHost
      ? `vox-${roomId}-host`
      : `vox-${roomId}-guest-${timestamp}`;
    this._remotePeerId = isHost ? "" : `vox-${roomId}-host`;

    this.setStatus("connecting", "Connecting to server...");

    try {
      // Create peer with explicit configuration
      this.peer = new Peer(this._peerId, {
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        },
        debug: 1, // Enable some logging for debugging
      });

      await this.waitForPeerOpen();
      console.log("📡 Peer connected to server:", this._peerId);

      this.setupPeerListeners();

      if (isHost) {
        this.setStatus("waiting", "Waiting for partner...");
      } else {
        this.setStatus("connecting", "Connecting to partner...");
        // Small delay to ensure host is ready
        setTimeout(() => this.connectToHost(), 500);
      }

      return true;
    } catch (error: any) {
      console.error("Talk connection error:", error);
      this.setStatus("failed", error.message || "Connection failed");
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
        reject(new Error("Connection timeout - try refreshing"));
      }, 30000);

      this.peer.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.peer.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private setupPeerListeners(): void {
    if (!this.peer) return;

    // Handle incoming connections (host receives this)
    this.peer.on("connection", (conn) => {
      console.log("📡 Incoming connection from:", conn.peer);

      // Clean up any existing connection first
      this.cleanupDataConnection();

      this._remotePeerId = conn.peer;
      this.setupDataConnection(conn);
    });

    this.peer.on("error", (error: any) => {
      console.error("Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable" && !this._isHost) {
        // Host not ready yet, keep trying
        this.setStatus("waiting", "Waiting for host...");
        setTimeout(() => this.connectToHost(), 2000);
      } else if (error.type === "unavailable-id") {
        // Our ID is taken, try with a new one
        console.log("ID conflict, retrying with new ID...");
        this.disconnect();
        setTimeout(() => {
          this.initialize(this.roomId, this._isHost, this._userName);
        }, 1000);
      } else if (this._status !== "connected") {
        this.attemptReconnect();
      }
    });

    this.peer.on("disconnected", () => {
      console.log("📡 Disconnected from signaling server");
      if (this._status === "connected" || this._status === "waiting") {
        // Try to reconnect to signaling server
        this.peer?.reconnect();
      }
    });

    this.peer.on("close", () => {
      console.log("📡 Peer connection closed");
    });
  }

  private connectToHost(): void {
    if (!this.peer || !this._remotePeerId) {
      console.error("Cannot connect: peer or remotePeerId missing");
      return;
    }

    if (!this.peer.open) {
      console.log("Peer not open yet, waiting...");
      setTimeout(() => this.connectToHost(), 500);
      return;
    }

    console.log("📡 Attempting to connect to host:", this._remotePeerId);

    // Clean up any existing connection
    this.cleanupDataConnection();

    const conn = this.peer.connect(this._remotePeerId, {
      reliable: true,
      serialization: "json",
    });

    this.setupDataConnection(conn);
  }

  private cleanupDataConnection(): void {
    this.isConnectionOpen = false;
    this.syncVerified = false;
    this.messageQueue = [];

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.dataConnection) {
      try {
        this.dataConnection.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.dataConnection = null;
    }
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnection = conn;
    this.isConnectionOpen = false;
    this.syncVerified = false;

    conn.on("open", () => {
      console.log("📡 Data channel OPEN - connection established");
      this.isConnectionOpen = true;
      this.reconnectAttempts = 0;

      // Start bidirectional sync verification
      this.startSyncVerification();

      // Flush any queued messages
      this.flushMessageQueue();

      // Start keepalive
      this.startKeepAlive();
    });

    conn.on("data", (data: any) => {
      this.handleIncomingData(data);
    });

    conn.on("close", () => {
      console.log("📡 Data channel closed");
      this.isConnectionOpen = false;
      this.syncVerified = false;
      this.stopKeepAlive();
      this.callbacks.onPartnerDisconnected?.();

      if (this._status === "connected") {
        this.setStatus("reconnecting", "Partner disconnected...");
        this.attemptReconnect();
      }
    });

    conn.on("error", (error) => {
      console.error("Data channel error:", error);
      // Don't immediately fail - try to recover
      if (!this.isConnectionOpen) {
        this.attemptReconnect();
      }
    });
  }

  private startSyncVerification(): void {
    // Send our presence and request sync confirmation
    console.log("📡 Starting sync verification...");

    this.directSend({
      type: "presence",
      data: { name: this._userName, action: "join" },
    });

    // Also send a sync request to verify bidirectional communication
    this.directSend({
      type: "sync-request",
      data: { timestamp: Date.now() },
    });

    // Set timeout for sync verification
    this.syncTimeout = setTimeout(() => {
      if (!this.syncVerified && this.isConnectionOpen) {
        console.log(
          "📡 Sync not verified, but connection is open - marking as connected",
        );
        // Even if we don't get sync-ack, if connection is open, proceed
        this.syncVerified = true;
        this.setStatus("connected", "Connected!");
      }
    }, 3000);
  }

  private handleIncomingData(data: any): void {
    if (!data || typeof data !== "object") return;

    const type = data.type as string;

    // Handle internal protocol messages
    switch (type) {
      case "ping":
        this.directSend({ type: "pong", data: { timestamp: Date.now() } });
        return;

      case "pong":
        // Connection is alive
        return;

      case "sync-request":
        // Partner is verifying connection, respond with ack
        console.log("📡 Received sync-request, sending sync-ack");
        this.directSend({ type: "sync-ack", data: { timestamp: Date.now() } });
        return;

      case "sync-ack":
        // Bidirectional sync confirmed
        console.log("📡 Sync verified - bidirectional connection confirmed!");
        this.syncVerified = true;
        if (this.syncTimeout) {
          clearTimeout(this.syncTimeout);
          this.syncTimeout = null;
        }
        this.setStatus("connected", "Connected!");
        return;

      case "presence":
        this.handlePresence(data.data);
        return;

      default:
        // Pass other messages to callback
        this.callbacks.onMessage?.(data as TalkMessage);
    }
  }

  private handlePresence(presenceData: any): void {
    const { name, action } = presenceData;

    if (action === "join") {
      console.log("📡 Partner joined:", name);
      this._partnerName = name;
      this.callbacks.onPartnerConnected?.(name);

      // Send acknowledgment
      this.directSend({
        type: "presence",
        data: { name: this._userName, action: "ack" },
      });

      // Also send sync-ack to confirm bidirectional
      this.directSend({
        type: "sync-ack",
        data: { timestamp: Date.now() },
      });
    } else if (action === "ack") {
      console.log("📡 Partner acknowledged:", name);
      this._partnerName = name;
      this.callbacks.onPartnerConnected?.(name);
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.isConnectionOpen) {
        this.directSend({ type: "ping", data: { timestamp: Date.now() } });
      }
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (
      this.isReconnecting ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setStatus("failed", "Connection failed - try refreshing");
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = Math.min(
      1000 * Math.pow(1.5, this.reconnectAttempts - 1),
      10000,
    );
    this.setStatus(
      "reconnecting",
      `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.isReconnecting = false;

      if (!this._isHost && this.peer?.open) {
        this.connectToHost();
      } else if (this._isHost) {
        // Host just waits for guest to reconnect
        this.setStatus("waiting", "Waiting for partner to reconnect...");
      }
    }, delay);
  }

  // Direct send without checking sync status (for protocol messages)
  private directSend(message: TalkMessage): boolean {
    if (!this.dataConnection) {
      console.log("📡 Cannot send - no data connection");
      return false;
    }

    // Check the underlying connection state
    const connOpen = this.dataConnection.open;

    if (!connOpen) {
      console.log("📡 Cannot send - connection not open");
      return false;
    }

    try {
      this.dataConnection.send(message);
      return true;
    } catch (error) {
      console.error("Send error:", error);
      return false;
    }
  }

  // Public send with queuing
  send(message: TalkMessage): boolean {
    // For user messages, queue if not fully connected
    if (!this.isConnectionOpen) {
      console.log("📡 Connection not open, queueing message");
      this.messageQueue.push(message);
      return false;
    }

    // Try to send
    const sent = this.directSend(message);

    if (!sent) {
      // Queue for retry
      this.messageQueue.push(message);
    }

    return sent;
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`📡 Flushing ${this.messageQueue.length} queued messages`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      if (!this.directSend(message)) {
        // Re-queue failed messages
        this.messageQueue.push(message);
      }
    }
  }

  private setStatus(status: TalkConnectionStatus, message?: string): void {
    this._status = status;
    console.log("📡 Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }

  disconnect(): void {
    console.log("📡 Disconnecting...");

    this.stopKeepAlive();

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cleanupDataConnection();

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        // Ignore
      }
      this.peer = null;
    }

    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.isConnectionOpen = false;
    this.syncVerified = false;
  }
}
