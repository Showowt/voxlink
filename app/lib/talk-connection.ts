import Peer, { DataConnection } from "peerjs";

// ═══════════════════════════════════════════════════════════════════════════════
// TALK CONNECTION - Production-Grade Real-time Data Sync for Face-to-Face Mode
// Uses PeerJS data channels for cross-device communication
// WhatsApp-level reliability with proper bidirectional handshake
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
    | "sync-ack"
    | "message-ack";
  data: Record<string, unknown>;
  messageId?: string;
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

// Connection state machine for proper handshake
type HandshakeState =
  | "disconnected"
  | "channel_open"
  | "presence_sent"
  | "presence_received"
  | "sync_requested"
  | "fully_synced";

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

  // Handshake state machine
  private handshakeState: HandshakeState = "disconnected";
  private localSyncId: string = "";
  private remoteSyncId: string = "";

  // Message queue for reliability
  private messageQueue: TalkMessage[] = [];
  private pendingAcks: Map<
    string,
    { message: TalkMessage; timestamp: number; retries: number }
  > = new Map();
  private ackTimeout: NodeJS.Timeout | null = null;

  // Timeouts
  private syncTimeout: NodeJS.Timeout | null = null;
  private handshakeTimeout: NodeJS.Timeout | null = null;

  // Last pong received timestamp for connection health
  private lastPongTime: number = 0;
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
    return (
      this._status === "connected" &&
      this.handshakeState === "fully_synced" &&
      this.connectionHealthy
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
    this.handshakeState = "disconnected";
    this.localSyncId = this.generateSyncId();

    // Use deterministic peer IDs for reliable reconnection
    // Host always has a stable ID, guest includes timestamp for uniqueness
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
        debug: 1,
      });

      await this.waitForPeerOpen();
      console.log("[TalkConnection] Peer connected to server:", this._peerId);

      this.setupPeerListeners();

      if (isHost) {
        this.setStatus("waiting", "Waiting for partner...");
      } else {
        this.setStatus("connecting", "Connecting to partner...");
        // Small delay to ensure host is ready
        setTimeout(() => this.connectToHost(), 500);
      }

      return true;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      console.error("[TalkConnection] Initialization error:", error);
      this.setStatus("failed", errorMessage);
      return false;
    }
  }

  private generateSyncId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
      console.log("[TalkConnection] Incoming connection from:", conn.peer);

      // Clean up any existing connection first
      this.cleanupDataConnection();

      this._remotePeerId = conn.peer;
      this.setupDataConnection(conn);
    });

    this.peer.on("error", (error: { type: string; message?: string }) => {
      console.error("[TalkConnection] Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable" && !this._isHost) {
        // Host not ready yet, keep trying
        this.setStatus("waiting", "Waiting for host...");
        setTimeout(() => this.connectToHost(), 2000);
      } else if (error.type === "unavailable-id") {
        // Our ID is taken, try with a new one
        console.log("[TalkConnection] ID conflict, retrying with new ID...");
        this.disconnect();
        setTimeout(() => {
          this.initialize(this.roomId, this._isHost, this._userName);
        }, 1000);
      } else if (this._status !== "connected") {
        this.attemptReconnect();
      }
    });

    this.peer.on("disconnected", () => {
      console.log("[TalkConnection] Disconnected from signaling server");
      if (this._status === "connected" || this._status === "waiting") {
        // Try to reconnect to signaling server
        this.peer?.reconnect();
      }
    });

    this.peer.on("close", () => {
      console.log("[TalkConnection] Peer connection closed");
    });
  }

  private connectToHost(): void {
    if (!this.peer || !this._remotePeerId) {
      console.error(
        "[TalkConnection] Cannot connect: peer or remotePeerId missing",
      );
      return;
    }

    if (!this.peer.open) {
      console.log("[TalkConnection] Peer not open yet, waiting...");
      setTimeout(() => this.connectToHost(), 500);
      return;
    }

    console.log(
      "[TalkConnection] Attempting to connect to host:",
      this._remotePeerId,
    );

    // Clean up any existing connection
    this.cleanupDataConnection();

    const conn = this.peer.connect(this._remotePeerId, {
      reliable: true,
      serialization: "json",
    });

    this.setupDataConnection(conn);
  }

  private cleanupDataConnection(): void {
    this.handshakeState = "disconnected";
    this.connectionHealthy = false;
    this.messageQueue = [];
    this.pendingAcks.clear();
    this.remoteSyncId = "";

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }

    if (this.ackTimeout) {
      clearTimeout(this.ackTimeout);
      this.ackTimeout = null;
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
    this.handshakeState = "disconnected";
    this.connectionHealthy = false;
    this.localSyncId = this.generateSyncId();

    conn.on("open", () => {
      console.log("[TalkConnection] Data channel OPEN");
      this.handshakeState = "channel_open";
      this.reconnectAttempts = 0;
      this.connectionHealthy = true;
      this.lastPongTime = Date.now();

      // Start the handshake - both sides participate
      this.initiateHandshake();

      // Start keepalive after short delay
      setTimeout(() => this.startKeepAlive(), 1000);

      // Start ack timeout checker
      this.startAckTimeoutChecker();
    });

    conn.on("data", (data: unknown) => {
      this.handleIncomingData(data);
    });

    conn.on("close", () => {
      console.log("[TalkConnection] Data channel closed");
      this.handshakeState = "disconnected";
      this.connectionHealthy = false;
      this.stopKeepAlive();
      this.callbacks.onPartnerDisconnected?.();

      if (this._status === "connected") {
        this.setStatus("reconnecting", "Partner disconnected...");
        this.attemptReconnect();
      }
    });

    conn.on("error", (error) => {
      console.error("[TalkConnection] Data channel error:", error);
      // Don't immediately fail - try to recover
      if (this.handshakeState === "disconnected") {
        this.attemptReconnect();
      }
    });
  }

  private initiateHandshake(): void {
    console.log(
      "[TalkConnection] Initiating handshake, role:",
      this._isHost ? "host" : "guest",
    );

    // Set handshake timeout - if not complete in 10 seconds, something is wrong
    this.handshakeTimeout = setTimeout(() => {
      if (this.handshakeState !== "fully_synced") {
        console.warn(
          "[TalkConnection] Handshake timeout, current state:",
          this.handshakeState,
        );
        // Force complete the handshake if channel is still open
        if (this.dataConnection?.open) {
          console.log(
            "[TalkConnection] Channel still open, forcing connection state",
          );
          this.handshakeState = "fully_synced";
          this.connectionHealthy = true;
          this.setStatus("connected", "Connected!");
          this.flushMessageQueue();
        }
      }
    }, 10000);

    // Step 1: Send presence to announce ourselves
    this.directSend({
      type: "presence",
      data: {
        name: this._userName,
        action: "join",
        role: this._isHost ? "host" : "guest",
        syncId: this.localSyncId,
      },
    });
    this.handshakeState = "presence_sent";

    // Step 2: After a short delay, send sync-request
    // This ensures presence is received first
    setTimeout(() => {
      // Check current state - only send sync-request if not already synced
      const currentState = this.handshakeState;
      if (
        currentState === "presence_sent" ||
        currentState === "presence_received" ||
        currentState === "channel_open"
      ) {
        this.directSend({
          type: "sync-request",
          data: {
            syncId: this.localSyncId,
            timestamp: Date.now(),
          },
        });
        this.handshakeState = "sync_requested";
      }
    }, 300);
  }

  private handleIncomingData(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const message = data as TalkMessage;
    const type = message.type;

    // Update connection health on any received data
    this.lastPongTime = Date.now();
    this.connectionHealthy = true;

    // Handle internal protocol messages
    switch (type) {
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

      case "sync-request":
        this.handleSyncRequest(message.data);
        return;

      case "sync-ack":
        this.handleSyncAck(message.data);
        return;

      case "message-ack":
        this.handleMessageAck(message.data);
        return;

      default:
        // For user messages, send acknowledgment if messageId exists
        if (message.messageId) {
          this.directSend({
            type: "message-ack",
            data: { messageId: message.messageId },
          });
        }
        // Pass other messages to callback
        this.callbacks.onMessage?.(message);
    }
  }

  private handlePresence(presenceData: Record<string, unknown>): void {
    const { name, action, syncId } = presenceData as {
      name?: string;
      action?: string;
      syncId?: string;
    };

    if (action === "join") {
      console.log(
        "[TalkConnection] Partner presence received:",
        name,
        "syncId:",
        syncId,
      );
      this._partnerName = name || "Partner";
      if (syncId) {
        this.remoteSyncId = syncId;
      }

      // Update handshake state
      if (
        this.handshakeState === "presence_sent" ||
        this.handshakeState === "channel_open"
      ) {
        this.handshakeState = "presence_received";
      }

      // Send presence acknowledgment
      this.directSend({
        type: "presence",
        data: {
          name: this._userName,
          action: "ack",
          role: this._isHost ? "host" : "guest",
          syncId: this.localSyncId,
        },
      });

      // Notify UI
      this.callbacks.onPartnerConnected?.(this._partnerName);
    } else if (action === "ack") {
      console.log("[TalkConnection] Partner presence ack received:", name);
      this._partnerName = name || "Partner";
      if (presenceData.syncId) {
        this.remoteSyncId = presenceData.syncId as string;
      }

      // Update handshake state
      if (
        this.handshakeState === "presence_sent" ||
        this.handshakeState === "channel_open"
      ) {
        this.handshakeState = "presence_received";
      }

      // Notify UI if not already
      if (this._partnerName) {
        this.callbacks.onPartnerConnected?.(this._partnerName);
      }
    }
  }

  private handleSyncRequest(syncData: Record<string, unknown>): void {
    const { syncId } = syncData as { syncId?: string };
    console.log("[TalkConnection] Received sync-request from:", syncId);

    if (syncId) {
      this.remoteSyncId = syncId;
    }

    // Respond with sync-ack immediately
    this.directSend({
      type: "sync-ack",
      data: {
        syncId: this.localSyncId,
        ackFor: syncId,
        timestamp: Date.now(),
      },
    });

    // If we haven't completed handshake yet and got a sync-request,
    // the other side might be waiting for our sync-request
    if (
      this.handshakeState !== "fully_synced" &&
      this.handshakeState !== "sync_requested"
    ) {
      this.directSend({
        type: "sync-request",
        data: {
          syncId: this.localSyncId,
          timestamp: Date.now(),
        },
      });
      this.handshakeState = "sync_requested";
    }
  }

  private handleSyncAck(syncData: Record<string, unknown>): void {
    const { syncId, ackFor } = syncData as { syncId?: string; ackFor?: string };
    console.log(
      "[TalkConnection] Received sync-ack, syncId:",
      syncId,
      "ackFor:",
      ackFor,
    );

    if (syncId) {
      this.remoteSyncId = syncId;
    }

    // Verify the ack is for our sync request
    if (
      ackFor === this.localSyncId ||
      this.handshakeState === "sync_requested"
    ) {
      console.log(
        "[TalkConnection] Handshake complete! Bidirectional sync confirmed.",
      );

      if (this.handshakeTimeout) {
        clearTimeout(this.handshakeTimeout);
        this.handshakeTimeout = null;
      }

      this.handshakeState = "fully_synced";
      this.connectionHealthy = true;
      this.setStatus("connected", "Connected!");

      // Flush any queued messages
      this.flushMessageQueue();
    }
  }

  private handleMessageAck(ackData: Record<string, unknown>): void {
    const { messageId } = ackData as { messageId?: string };
    if (messageId && this.pendingAcks.has(messageId)) {
      console.log("[TalkConnection] Message acknowledged:", messageId);
      this.pendingAcks.delete(messageId);
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.dataConnection?.open) {
        // Check if connection is still healthy
        const timeSinceLastPong = Date.now() - this.lastPongTime;
        if (timeSinceLastPong > 15000) {
          // 15 seconds without pong = connection might be dead
          console.warn(
            "[TalkConnection] No pong received for 15s, connection may be dead",
          );
          this.connectionHealthy = false;
          // Try to recover
          this.directSend({ type: "ping", data: { timestamp: Date.now() } });
        } else {
          this.directSend({ type: "ping", data: { timestamp: Date.now() } });
        }
      }
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private startAckTimeoutChecker(): void {
    if (this.ackTimeout) {
      clearInterval(this.ackTimeout);
    }

    this.ackTimeout = setInterval(() => {
      const now = Date.now();
      // Use Array.from for ES5 compatibility
      const entries = Array.from(this.pendingAcks.entries());
      for (let i = 0; i < entries.length; i++) {
        const [messageId, pending] = entries[i];
        // If message not acked in 5 seconds, retry
        if (now - pending.timestamp > 5000) {
          if (pending.retries < 3) {
            console.log(
              "[TalkConnection] Retrying unacked message:",
              messageId,
            );
            pending.retries++;
            pending.timestamp = now;
            this.directSend(pending.message);
          } else {
            // Give up after 3 retries
            console.warn(
              "[TalkConnection] Message delivery failed after 3 retries:",
              messageId,
            );
            this.pendingAcks.delete(messageId);
          }
        }
      }
    }, 2000);
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

  // Direct send without queuing (for protocol messages)
  private directSend(message: TalkMessage): boolean {
    if (!this.dataConnection) {
      console.log("[TalkConnection] Cannot send - no data connection");
      return false;
    }

    // Check the underlying connection state
    if (!this.dataConnection.open) {
      console.log("[TalkConnection] Cannot send - connection not open");
      return false;
    }

    try {
      this.dataConnection.send(message);
      return true;
    } catch (error) {
      console.error("[TalkConnection] Send error:", error);
      return false;
    }
  }

  // Public send with queuing and acknowledgment tracking
  send(message: TalkMessage): boolean {
    // Generate message ID for tracking if not present
    if (
      !message.messageId &&
      (message.type === "message" || message.type === "live")
    ) {
      message.messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    // Queue if not fully connected
    if (this.handshakeState !== "fully_synced" || !this.dataConnection?.open) {
      console.log(
        "[TalkConnection] Not fully connected, queueing message, state:",
        this.handshakeState,
      );
      this.messageQueue.push(message);
      return false;
    }

    // Try to send
    const sent = this.directSend(message);

    if (!sent) {
      // Queue for retry
      this.messageQueue.push(message);
      return false;
    }

    // Track message for acknowledgment (only for important messages)
    if (message.messageId && message.type === "message") {
      this.pendingAcks.set(message.messageId, {
        message,
        timestamp: Date.now(),
        retries: 0,
      });
    }

    return true;
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(
      `[TalkConnection] Flushing ${this.messageQueue.length} queued messages`,
    );

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queue) {
      if (!this.directSend(message)) {
        // Re-queue failed messages
        this.messageQueue.push(message);
      } else if (message.messageId && message.type === "message") {
        // Track for acknowledgment
        this.pendingAcks.set(message.messageId, {
          message,
          timestamp: Date.now(),
          retries: 0,
        });
      }
    }
  }

  private setStatus(status: TalkConnectionStatus, message?: string): void {
    this._status = status;
    console.log("[TalkConnection] Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }

  disconnect(): void {
    console.log("[TalkConnection] Disconnecting...");

    this.stopKeepAlive();

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ackTimeout) {
      clearInterval(this.ackTimeout);
      this.ackTimeout = null;
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
    this.handshakeState = "disconnected";
    this.connectionHealthy = false;
  }
}
