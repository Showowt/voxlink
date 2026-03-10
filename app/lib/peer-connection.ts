import Peer, { MediaConnection, DataConnection } from "peerjs";

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK CONNECTION TYPE (Navigator.connection API)
// ═══════════════════════════════════════════════════════════════════════════════

interface NetworkInformation extends EventTarget {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CONNECTION v2.0 - Bulletproof Video Calls
// Fixed: Connection reliability, retry logic, ICE handling
// ═══════════════════════════════════════════════════════════════════════════════

export type ConnectionMode = "video" | "talk";
export type ConnectionStatus =
  | "initializing"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed"
  | "room_full";

export type IceConnectionState =
  | "new"
  | "checking"
  | "connected"
  | "completed"
  | "disconnected"
  | "failed"
  | "closed";

// Connection quality metrics
export interface ConnectionQuality {
  // Quality score: 'excellent' | 'good' | 'fair' | 'poor'
  quality: "excellent" | "good" | "fair" | "poor";
  // Packet loss percentage (0-100)
  packetLoss: number;
  // Round trip time in ms
  rtt: number;
  // Jitter in ms
  jitter: number;
  // Estimated bandwidth in kbps
  bandwidth: number;
  // Timestamp of measurement
  timestamp: number;
}

export interface PeerCallbacks {
  onStatusChange?: (status: ConnectionStatus, message?: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onDataMessage?: (data: unknown) => void;
  onPartnerJoined?: (name: string) => void;
  onPartnerLeft?: () => void;
  onError?: (error: string) => void;
  onIceStateChange?: (state: IceConnectionState) => void;
  onQualityUpdate?: (quality: ConnectionQuality) => void;
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
    console.warn("[Voxxo] Failed to fetch TURN credentials:", err);
  }
  return DEFAULT_ICE_SERVERS;
}

export class PeerConnection {
  private peer: Peer | null = null;
  private dataConnection: DataConnection | null = null;
  private mediaConnection: MediaConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private mode: ConnectionMode = "video";
  private roomId: string = "";
  private isHost: boolean = false;
  private userName: string = "";
  private myPeerId: string = "";
  private hostPeerId: string = "";

  private _status: ConnectionStatus = "initializing";
  private callbacks: PeerCallbacks = {};
  private isDestroyed: boolean = false;
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 30; // Increased from 5
  private connectionAttemptInterval: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private videoRetryTimeout: NodeJS.Timeout | null = null;
  private videoRetryAttempts: number = 0;
  private static readonly MAX_VIDEO_RETRIES = 3;
  private static readonly VIDEO_RETRY_DELAY = 5000; // 5 seconds
  private lastPongTime: number = Date.now();
  private previousStats: {
    packetsReceived: number;
    packetsLost: number;
    bytesReceived: number;
    timestamp: number;
  } | null = null;

  // Network change detection
  private networkChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private lastNetworkType: string | null = null;
  private isOffline: boolean = false;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
    this.setupNetworkListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK CHANGE DETECTION - Proactive ICE restart on network switch
  // ═══════════════════════════════════════════════════════════════════════════

  private setupNetworkListeners(): void {
    if (typeof window === "undefined") return;

    // Online/offline detection
    this.onlineHandler = () => {
      console.log("[Voxxo Video] Network: Back online");
      this.isOffline = false;

      // If we were connected, trigger ICE restart
      if (this._status === "connected" || this._status === "reconnecting") {
        this.triggerIceRestart();
      }
    };

    this.offlineHandler = () => {
      console.log("[Voxxo Video] Network: Went offline");
      this.isOffline = true;
      if (this._status === "connected") {
        this.setStatus("reconnecting", "Network offline...");
      }
    };

    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    // Network Information API (for WiFi ↔ cellular detection)
    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection) {
      this.lastNetworkType =
        connection.type || connection.effectiveType || null;

      this.networkChangeHandler = () => {
        const newType = connection.type || connection.effectiveType || null;
        console.log(
          `[Voxxo Video] Network type changed: ${this.lastNetworkType} → ${newType}`,
        );

        // If type changed and we're connected, trigger ICE restart
        if (newType !== this.lastNetworkType && this._status === "connected") {
          console.log(
            "[Voxxo Video] Triggering ICE restart due to network change",
          );
          this.triggerIceRestart();
        }

        this.lastNetworkType = newType;
      };

      connection.addEventListener("change", this.networkChangeHandler);
    }
  }

  private removeNetworkListeners(): void {
    if (typeof window === "undefined") return;

    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
    }
    if (this.offlineHandler) {
      window.removeEventListener("offline", this.offlineHandler);
    }

    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection && this.networkChangeHandler) {
      connection.removeEventListener("change", this.networkChangeHandler);
    }
  }

  private triggerIceRestart(): void {
    if (!this.mediaConnection || this.isDestroyed) return;

    try {
      const pc = (
        this.mediaConnection as unknown as {
          peerConnection?: RTCPeerConnection;
        }
      ).peerConnection;

      if (pc && pc.iceConnectionState !== "closed") {
        console.log("[Voxxo Video] Restarting ICE...");
        pc.restartIce?.();
      }
    } catch (err) {
      console.warn("[Voxxo Video] ICE restart failed:", err);
    }
  }

  get status() {
    return this._status;
  }

  get isConnected() {
    return this._status === "connected";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN CONNECTION FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(
    roomId: string,
    isHost: boolean,
    userName: string,
    mode: ConnectionMode,
    localStream?: MediaStream,
  ): Promise<boolean> {
    this.roomId = roomId.toUpperCase(); // Normalize to uppercase
    this.isHost = isHost;
    this.userName = userName;
    this.mode = mode;
    this.localStream = localStream || null;
    this.isDestroyed = false;
    this.connectionAttempts = 0;

    // Generate peer IDs - deterministic for host, unique for guest
    this.hostPeerId = `voxxo-video-${this.roomId}-host`;

    if (isHost) {
      this.myPeerId = this.hostPeerId;
    } else {
      const uniqueId = Math.random().toString(36).substring(2, 8);
      this.myPeerId = `voxxo-video-${this.roomId}-guest-${uniqueId}`;
    }

    this.setStatus("initializing", "Connecting...");

    try {
      // Fetch ICE servers (TURN credentials from server)
      const iceServers = await getIceServers();

      // Create peer with explicit PeerJS cloud configuration
      this.peer = new Peer(this.myPeerId, {
        host: "0.peerjs.com",
        port: 443,
        secure: true,
        path: "/",
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
        },
        debug: 2,
      });

      await this.waitForPeerOpen();
      console.log("[Voxxo Video] Connected as:", this.myPeerId);

      this.setupPeerListeners();

      if (isHost) {
        this.setStatus("waiting", "Waiting for partner...");
      } else {
        this.setStatus("connecting", "Looking for host...");
        this.startConnectionAttempts();
      }

      return true;
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      console.error("[Voxxo Video] Init error:", err);
      this.setStatus("failed", errorMessage);
      this.callbacks.onError?.(errorMessage);
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
        reject(new Error("Connection timeout - please refresh"));
      }, 20000);

      this.peer.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.peer.on("error", (error) => {
        clearTimeout(timeout);
        if (error.type === "unavailable-id") {
          reject(new Error("Room already in use - try a different code"));
        } else {
          reject(error);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PEER LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════

  private setupPeerListeners(): void {
    if (!this.peer) return;

    // Handle incoming data connection (host receives this)
    this.peer.on("connection", (conn) => {
      if (this.isDestroyed) return;
      console.log("[Voxxo Video] Incoming data connection:", conn.peer);

      // Check if host already has a connected partner
      if (this.isHost && this.dataConnection?.open) {
        console.log(
          "[Voxxo Video] Room full - rejecting new connection:",
          conn.peer,
        );
        // Send room_full message to the new joiner and close their connection
        conn.on("open", () => {
          conn.send({ type: "room_full" });
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

      this.handleDataConnection(conn);
    });

    // Handle incoming video call (host receives this)
    this.peer.on("call", (call) => {
      if (this.isDestroyed) return;
      console.log("[Voxxo Video] Incoming call:", call.peer);

      // Check if host already has a connected partner - reject call if room full
      if (this.isHost && this.mediaConnection?.open) {
        console.log(
          "[Voxxo Video] Room full - rejecting video call:",
          call.peer,
        );
        try {
          call.close();
        } catch {
          // Ignore close errors
        }
        return;
      }

      // Answer with our stream
      if (this.localStream) {
        call.answer(this.localStream);
      } else {
        call.answer();
      }

      this.handleMediaConnection(call);
    });

    this.peer.on("error", (error: { type: string; message?: string }) => {
      console.error("[Voxxo Video] Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable" && !this.isHost) {
        console.log("[Voxxo Video] Host not found, will retry...");
      } else if (error.type === "unavailable-id" && this.isHost) {
        this.setStatus("failed", "Room code in use - try a new code");
        this.callbacks.onError?.("Room code in use");
      }
    });

    this.peer.on("disconnected", () => {
      console.log("[Voxxo Video] Disconnected from signaling server");
      if (!this.isDestroyed && this.peer && !this.peer.destroyed) {
        setTimeout(() => this.peer?.reconnect(), 1000);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION ATTEMPTS (Guest) - Exponential Backoff with Jitter
  // ═══════════════════════════════════════════════════════════════════════════

  // Backoff configuration
  private static readonly BASE_DELAY = 1000; // 1 second
  private static readonly MAX_DELAY = 16000; // 16 seconds max
  private static readonly BACKOFF_FACTOR = 2;
  private static readonly JITTER_FACTOR = 0.2; // ±20%

  private calculateBackoffDelay(): number {
    // Exponential: 1s → 2s → 4s → 8s → 16s (capped)
    const exponentialDelay =
      PeerConnection.BASE_DELAY *
      Math.pow(PeerConnection.BACKOFF_FACTOR, this.connectionAttempts - 1);
    const cappedDelay = Math.min(exponentialDelay, PeerConnection.MAX_DELAY);

    // Add jitter (±20%) to prevent thundering herd
    const jitter = cappedDelay * PeerConnection.JITTER_FACTOR;
    const randomJitter = (Math.random() - 0.5) * 2 * jitter;

    return Math.round(cappedDelay + randomJitter);
  }

  private startConnectionAttempts(): void {
    this.stopConnectionAttempts();

    const tryConnect = () => {
      if (this.isDestroyed || this._status === "connected") {
        this.stopConnectionAttempts();
        return;
      }

      this.connectionAttempts++;
      if (this.connectionAttempts > this.maxConnectionAttempts) {
        this.setStatus("failed", "Could not find host - ask them to refresh");
        this.callbacks.onError?.("Could not find host");
        return;
      }

      const delay = this.calculateBackoffDelay();
      console.log(
        `[Voxxo Video] Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts} (next in ${delay}ms)`,
      );
      this.connectToHost();

      // Schedule next attempt with exponential backoff
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.connectionAttemptInterval = setTimeout(tryConnect, delay);
      }
    };

    // First attempt immediately
    tryConnect();
  }

  private stopConnectionAttempts(): void {
    if (this.connectionAttemptInterval) {
      clearTimeout(this.connectionAttemptInterval);
      this.connectionAttemptInterval = null;
    }
  }

  private connectToHost(): void {
    if (!this.peer || this.isDestroyed || !this.peer.open) {
      return;
    }

    // Don't reconnect if already connected
    if (this.dataConnection?.open) {
      return;
    }

    console.log("[Voxxo Video] Connecting to host:", this.hostPeerId);

    // Create data connection first
    const conn = this.peer.connect(this.hostPeerId, {
      reliable: true,
      serialization: "json",
    });

    this.handleDataConnection(conn);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA CONNECTION
  // ═══════════════════════════════════════════════════════════════════════════

  private handleDataConnection(conn: DataConnection): void {
    // Avoid duplicate connections
    if (this.dataConnection?.open && this.dataConnection.peer === conn.peer) {
      return;
    }

    // Close old connection
    if (this.dataConnection && this.dataConnection.peer !== conn.peer) {
      try {
        this.dataConnection.close();
      } catch {
        // Ignore
      }
    }

    this.dataConnection = conn;

    conn.on("open", () => {
      if (this.isDestroyed) return;
      console.log("[Voxxo Video] Data channel open");

      this.stopConnectionAttempts();
      this.connectionAttempts = 0;
      this.videoRetryAttempts = 0;
      this.lastPongTime = Date.now();

      // Send hello
      this.send({ type: "hello", name: this.userName });

      // Start keep-alive
      this.startKeepAlive();

      // BIDIRECTIONAL VIDEO CALL INITIATION
      // Both sides attempt to establish video for maximum reliability
      if (this.localStream) {
        // Guest initiates immediately
        if (!this.isHost) {
          setTimeout(() => this.initiateVideoCallWithRetry(), 500);
        } else {
          // Host initiates with slight delay to avoid race condition
          // This acts as backup if guest's call fails
          setTimeout(() => this.initiateVideoCallWithRetry(), 1500);
        }
      }

      this.setStatus("connecting", "Establishing video...");
    });

    conn.on("data", (data: unknown) => {
      if (this.isDestroyed) return;
      this.handleDataMessage(data);
    });

    conn.on("close", () => {
      console.log("[Voxxo Video] Data channel closed");
      this.handlePartnerLeft();
    });

    conn.on("error", (err) => {
      console.error("[Voxxo Video] Data channel error:", err);
    });
  }

  private handleDataMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const msg = data as Record<string, unknown>;

    // Room full message - 3rd person trying to join
    if (msg.type === "room_full") {
      console.log("[Voxxo Video] Room is full - cannot join");
      this.stopConnectionAttempts();
      this.setStatus(
        "room_full",
        "This room is full. Only 2 participants allowed.",
      );
      this.callbacks.onError?.(
        "This room is full. Only 2 participants allowed.",
      );
      return;
    }

    // Keep-alive
    if (msg.type === "ping") {
      this.send({ type: "pong", time: msg.time });
      return;
    }

    if (msg.type === "pong") {
      this.lastPongTime = Date.now();
      return;
    }

    // Hello message
    if (msg.type === "hello") {
      const name = String(msg.name || "Partner");
      console.log("[Voxxo Video] Partner joined:", name);
      this.callbacks.onPartnerJoined?.(name);

      // Send hello back
      this.send({ type: "hello", name: this.userName });
      return;
    }

    // Forward other messages
    this.callbacks.onDataMessage?.(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO CALL WITH RETRY LOGIC AND ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  // Stream timeout - 8 seconds to receive remote stream
  private static readonly STREAM_TIMEOUT = 8000;
  private streamTimeoutId: NodeJS.Timeout | null = null;
  private streamReceived: boolean = false;

  private initiateVideoCallWithRetry(): void {
    if (this.isDestroyed) return;

    // Already have a working video stream - no retry needed
    if (this.remoteStream) {
      console.log(
        "[Voxxo Video] Already have remote stream, skipping video call",
      );
      return;
    }

    // Clear any existing timeouts
    this.clearVideoRetryTimeout();
    this.clearStreamTimeout();

    // Reset stream received flag for this attempt
    this.streamReceived = false;

    this.initiateVideoCall();

    // Set up stream timeout - if no stream received within 8 seconds, handle error
    this.streamTimeoutId = setTimeout(() => {
      if (this.isDestroyed) return;

      // Check if we got a stream
      if (!this.streamReceived && !this.remoteStream) {
        console.warn(
          `[Voxxo Video] Stream timeout after ${PeerConnection.STREAM_TIMEOUT}ms`,
        );
        this.handleVideoCallError(
          "Stream timeout - partner may not have video enabled",
        );
      }
    }, PeerConnection.STREAM_TIMEOUT);
  }

  private clearVideoRetryTimeout(): void {
    if (this.videoRetryTimeout) {
      clearTimeout(this.videoRetryTimeout);
      this.videoRetryTimeout = null;
    }
  }

  private clearStreamTimeout(): void {
    if (this.streamTimeoutId) {
      clearTimeout(this.streamTimeoutId);
      this.streamTimeoutId = null;
    }
  }

  /**
   * Handle video call errors with retry logic
   */
  private handleVideoCallError(reason: string): void {
    console.error(`[Voxxo Video] Video call error: ${reason}`);

    // Clear timeouts
    this.clearStreamTimeout();
    this.clearVideoRetryTimeout();

    // Close failed media connection
    if (this.mediaConnection) {
      try {
        this.mediaConnection.close();
      } catch {
        // Ignore close errors
      }
      this.mediaConnection = null;
    }

    this.videoRetryAttempts++;

    if (
      this.videoRetryAttempts < PeerConnection.MAX_VIDEO_RETRIES &&
      !this.isDestroyed
    ) {
      // Calculate retry delay with exponential backoff: 2s, 4s, 8s
      const retryDelay = 2000 * Math.pow(2, this.videoRetryAttempts - 1);
      console.log(
        `[Voxxo Video] Scheduling video retry in ${retryDelay}ms (attempt ${this.videoRetryAttempts + 1}/${PeerConnection.MAX_VIDEO_RETRIES})`,
      );

      this.setStatus(
        "reconnecting",
        `Retrying video... (${this.videoRetryAttempts}/${PeerConnection.MAX_VIDEO_RETRIES})`,
      );

      this.videoRetryTimeout = setTimeout(() => {
        if (
          !this.isDestroyed &&
          this.localStream &&
          this.peer?.open &&
          this.dataConnection?.open
        ) {
          this.initiateVideoCallWithRetry();
        }
      }, retryDelay);
    } else if (!this.isDestroyed) {
      // Max retries exhausted
      console.error("[Voxxo Video] Max video call retries exhausted");
      this.setStatus(
        "failed",
        "Video connection failed - please refresh and try again",
      );
      this.callbacks.onError?.(`Video connection failed: ${reason}`);
    }
  }

  private initiateVideoCall(): void {
    if (!this.peer || !this.localStream || this.isDestroyed) {
      console.warn(
        "[Voxxo Video] Cannot initiate call - missing prerequisites",
        {
          hasPeer: !!this.peer,
          hasLocalStream: !!this.localStream,
          isDestroyed: this.isDestroyed,
        },
      );
      return;
    }

    // Don't create duplicate calls if we already have an open connection with stream
    if (this.mediaConnection?.open && this.remoteStream) {
      console.log(
        "[Voxxo Video] Already have active media connection with stream",
      );
      return;
    }

    // Determine target peer ID
    // Guest calls host, host calls guest (using the data connection's peer ID)
    const targetPeerId = this.isHost
      ? this.dataConnection?.peer
      : this.hostPeerId;

    if (!targetPeerId) {
      console.error("[Voxxo Video] No target peer ID for video call");
      this.handleVideoCallError("No target peer available");
      return;
    }

    console.log(
      `[Voxxo Video] ${this.isHost ? "Host" : "Guest"} initiating video call to: ${targetPeerId} (attempt ${this.videoRetryAttempts + 1}/${PeerConnection.MAX_VIDEO_RETRIES})`,
    );

    try {
      const call = this.peer.call(targetPeerId, this.localStream);

      if (!call) {
        console.error("[Voxxo Video] peer.call() returned null/undefined");
        this.handleVideoCallError("Failed to create call object");
        return;
      }

      this.handleMediaConnection(call);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error initiating call";
      console.error("[Voxxo Video] Exception initiating video call:", err);
      this.handleVideoCallError(errorMsg);
    }
  }

  private handleMediaConnection(call: MediaConnection): void {
    // Avoid duplicate connections if we already have a working stream
    if (
      this.mediaConnection?.peer === call.peer &&
      this.mediaConnection.open &&
      this.remoteStream
    ) {
      console.log(
        "[Voxxo Video] Ignoring duplicate media connection - already have stream",
      );
      return;
    }

    // Close old connection if different peer
    if (this.mediaConnection && this.mediaConnection.peer !== call.peer) {
      console.log("[Voxxo Video] Closing old media connection for new peer");
      try {
        this.mediaConnection.close();
      } catch {
        // Ignore
      }
    }

    this.mediaConnection = call;
    console.log(`[Voxxo Video] Handling media connection from: ${call.peer}`);

    // Track if we received a stream through this connection
    let connectionStreamReceived = false;

    call.on("stream", (stream) => {
      if (this.isDestroyed) return;

      // Avoid duplicate stream events
      if (this.remoteStream?.id === stream.id) {
        console.log("[Voxxo Video] Ignoring duplicate stream event");
        return;
      }

      console.log("[Voxxo Video] Remote stream received!", {
        streamId: stream.id,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      // Mark stream as received - prevents timeout and retry from triggering
      this.streamReceived = true;
      connectionStreamReceived = true;

      // Clear all timeouts on successful stream
      this.clearStreamTimeout();
      this.clearVideoRetryTimeout();

      // Reset retry counter on success
      this.videoRetryAttempts = 0;

      this.remoteStream = stream;
      this.callbacks.onRemoteStream?.(stream);

      // NOW we're truly connected - data channel + video stream
      this.setStatus("connected", "Connected!");

      // Start quality monitoring when we have video
      this.startStatsMonitoring();
    });

    call.on("close", () => {
      console.log("[Voxxo Video] Media connection closed", {
        hadStream: connectionStreamReceived,
        isDestroyed: this.isDestroyed,
        currentStatus: this._status,
      });

      // If connection closed before stream was received, trigger retry
      if (
        !connectionStreamReceived &&
        !this.isDestroyed &&
        this._status !== "failed"
      ) {
        console.warn(
          "[Voxxo Video] Media connection closed before stream received",
        );
        this.handleVideoCallError(
          "Connection closed before video stream received",
        );
      }

      this.remoteStream = null;
    });

    call.on("error", (err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[Voxxo Video] Media connection error:", errorMsg);

      // Trigger retry on error (if we haven't received a stream yet)
      if (
        !connectionStreamReceived &&
        !this.isDestroyed &&
        this._status !== "failed"
      ) {
        this.handleVideoCallError(`Media error: ${errorMsg}`);
      }
    });

    // Monitor ICE state for connection health
    const pc = (call as unknown as { peerConnection: RTCPeerConnection })
      .peerConnection;
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState as IceConnectionState;
        console.log("[Voxxo Video] ICE state:", state);

        // Notify UI of ICE state changes
        this.callbacks.onIceStateChange?.(state);

        if (state === "failed") {
          console.log("[Voxxo Video] ICE failed, attempting restart...");
          try {
            pc.restartIce?.();
          } catch (err) {
            console.error("[Voxxo Video] ICE restart failed:", err);
            // If ICE restart fails and no stream, trigger video retry
            if (
              !this.streamReceived &&
              !this.isDestroyed &&
              this._status !== "failed"
            ) {
              this.handleVideoCallError("ICE connection failed");
            }
          }
        }

        if (state === "disconnected") {
          // Wait 3 seconds before attempting ICE restart for disconnected state
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected" && !this.isDestroyed) {
              console.log(
                "[Voxxo Video] ICE still disconnected after 3s, restarting...",
              );
              try {
                pc.restartIce?.();
              } catch {
                // Ignore
              }
            }
          }, 3000);
        }

        if (state === "connected" || state === "completed") {
          console.log("[Voxxo Video] ICE connection established successfully");
        }
      };

      // Monitor ICE gathering state for debugging
      pc.onicegatheringstatechange = () => {
        console.log("[Voxxo Video] ICE gathering state:", pc.iceGatheringState);
      };

      // Monitor connection state (WebRTC 1.0)
      pc.onconnectionstatechange = () => {
        console.log("[Voxxo Video] Connection state:", pc.connectionState);

        if (pc.connectionState === "failed" && !this.isDestroyed) {
          console.error("[Voxxo Video] RTCPeerConnection failed");
          if (!this.streamReceived && this._status !== "failed") {
            this.handleVideoCallError("Peer connection failed");
          }
        }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEEP-ALIVE
  // ═══════════════════════════════════════════════════════════════════════════

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
        console.warn("[Voxxo Video] No pong for 15s");
      }

      this.send({ type: "ping", time: Date.now() });
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private handlePartnerLeft(): void {
    this.stopKeepAlive();
    this.stopStatsMonitoring();
    this.callbacks.onPartnerLeft?.();
    this.remoteStream = null;

    if (this._status === "connected" && !this.isDestroyed) {
      this.setStatus("waiting", "Partner disconnected");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY MONITORING - RTCPeerConnection.getStats()
  // ═══════════════════════════════════════════════════════════════════════════

  private startStatsMonitoring(): void {
    this.stopStatsMonitoring();

    // Poll stats every 2 seconds
    this.statsInterval = setInterval(() => {
      this.collectStats();
    }, 2000);
  }

  private stopStatsMonitoring(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.previousStats = null;
  }

  private async collectStats(): Promise<void> {
    if (!this.mediaConnection || this.isDestroyed) return;

    try {
      // Get the underlying RTCPeerConnection
      const pc = (
        this.mediaConnection as unknown as {
          peerConnection?: RTCPeerConnection;
        }
      ).peerConnection;
      if (!pc) return;

      const stats = await pc.getStats();
      let packetsReceived = 0;
      let packetsLost = 0;
      let bytesReceived = 0;
      let jitter = 0;
      let rtt = 0;

      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          packetsReceived = report.packetsReceived || 0;
          packetsLost = report.packetsLost || 0;
          jitter = (report.jitter || 0) * 1000; // Convert to ms
          bytesReceived = report.bytesReceived || 0;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          rtt = report.currentRoundTripTime
            ? report.currentRoundTripTime * 1000
            : 0;
        }
      });

      const now = Date.now();

      // Calculate quality metrics
      let packetLoss = 0;
      let bandwidth = 0;

      if (this.previousStats) {
        const timeDelta = (now - this.previousStats.timestamp) / 1000;
        const packetsInPeriod =
          packetsReceived - this.previousStats.packetsReceived;
        const lostInPeriod = packetsLost - this.previousStats.packetsLost;
        const bytesInPeriod = bytesReceived - this.previousStats.bytesReceived;

        if (packetsInPeriod + lostInPeriod > 0) {
          packetLoss = (lostInPeriod / (packetsInPeriod + lostInPeriod)) * 100;
        }

        // Bandwidth in kbps
        bandwidth = timeDelta > 0 ? (bytesInPeriod * 8) / timeDelta / 1000 : 0;
      }

      // Store for next calculation
      this.previousStats = {
        packetsReceived,
        packetsLost,
        bytesReceived,
        timestamp: now,
      };

      // Determine quality level
      let quality: ConnectionQuality["quality"] = "excellent";
      if (packetLoss > 10 || rtt > 300) {
        quality = "poor";
      } else if (packetLoss > 5 || rtt > 200) {
        quality = "fair";
      } else if (packetLoss > 2 || rtt > 100) {
        quality = "good";
      }

      // Notify callback
      this.callbacks.onQualityUpdate?.({
        quality,
        packetLoss: Math.round(packetLoss * 10) / 10,
        rtt: Math.round(rtt),
        jitter: Math.round(jitter),
        bandwidth: Math.round(bandwidth),
        timestamp: now,
      });
    } catch (err) {
      console.warn("[Voxxo] Stats collection error:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  send(data: unknown): boolean {
    if (!this.dataConnection?.open || this.isDestroyed) {
      return false;
    }

    try {
      this.dataConnection.send(data);
      return true;
    } catch (err) {
      console.error("[Voxxo Video] Send error:", err);
      return false;
    }
  }

  disconnect(): void {
    console.log("[Voxxo Video] Disconnecting...");
    this.isDestroyed = true;

    this.stopKeepAlive();
    this.stopStatsMonitoring();
    this.stopConnectionAttempts();
    this.clearVideoRetryTimeout();
    this.clearStreamTimeout();
    this.removeNetworkListeners();

    // Stop local media tracks (camera/microphone)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    try {
      this.mediaConnection?.close();
    } catch {
      // Ignore
    }
    try {
      this.dataConnection?.close();
    } catch {
      // Ignore
    }
    try {
      this.peer?.destroy();
    } catch {
      // Ignore
    }

    this.peer = null;
    this.dataConnection = null;
    this.mediaConnection = null;
    this.remoteStream = null;
    this.connectionAttempts = 0;
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this.isDestroyed) return;
    this._status = status;
    console.log("[Voxxo Video] Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMERA HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCamera(
  facingMode: "user" | "environment" = "user",
): Promise<MediaStream> {
  const constraints = [
    // HD video + audio
    {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    // SD video + audio fallback
    {
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    },
    // Minimum video + audio
    { video: true, audio: true },
    // Audio only (no camera) - allows calls without camera
    { video: false, audio: { echoCancellation: true, noiseSuppression: true } },
    // Minimum audio only
    { video: false, audio: true },
  ];

  let lastError: Error | null = null;

  for (const constraint of constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;
      console.log(
        `[Voxxo] Media acquired - Video: ${hasVideo}, Audio: ${hasAudio}`,
      );
      return stream;
    } catch (err: unknown) {
      if (err instanceof Error) {
        lastError = err;
        // Only throw immediately for permission denied (user action required)
        if (err.name === "NotAllowedError") {
          throw new Error(
            "Camera/microphone access denied. Please allow access in browser settings.",
          );
        }
      }
      // Try next constraint (including audio-only fallbacks)
    }
  }

  // If we get here, nothing worked
  throw lastError || new Error("Could not access camera or microphone");
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
