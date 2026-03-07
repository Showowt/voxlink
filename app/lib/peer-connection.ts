import Peer, { MediaConnection, DataConnection } from "peerjs";

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
    console.warn("[VoxLink] Failed to fetch TURN credentials:", err);
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
  private lastPongTime: number = Date.now();
  private previousStats: {
    packetsReceived: number;
    packetsLost: number;
    bytesReceived: number;
    timestamp: number;
  } | null = null;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
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
    this.hostPeerId = `voxlink-video-${this.roomId}-host`;

    if (isHost) {
      this.myPeerId = this.hostPeerId;
    } else {
      const uniqueId = Math.random().toString(36).substring(2, 8);
      this.myPeerId = `voxlink-video-${this.roomId}-guest-${uniqueId}`;
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
      console.log("[VoxLink Video] Connected as:", this.myPeerId);

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
      console.error("[VoxLink Video] Init error:", err);
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
      console.log("[VoxLink Video] Incoming data connection:", conn.peer);

      // Check if host already has a connected partner
      if (this.isHost && this.dataConnection?.open) {
        console.log(
          "[VoxLink Video] Room full - rejecting new connection:",
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
      console.log("[VoxLink Video] Incoming call:", call.peer);

      // Check if host already has a connected partner - reject call if room full
      if (this.isHost && this.mediaConnection?.open) {
        console.log(
          "[VoxLink Video] Room full - rejecting video call:",
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
      console.error("[VoxLink Video] Peer error:", error.type, error.message);

      if (error.type === "peer-unavailable" && !this.isHost) {
        console.log("[VoxLink Video] Host not found, will retry...");
      } else if (error.type === "unavailable-id" && this.isHost) {
        this.setStatus("failed", "Room code in use - try a new code");
        this.callbacks.onError?.("Room code in use");
      }
    });

    this.peer.on("disconnected", () => {
      console.log("[VoxLink Video] Disconnected from signaling server");
      if (!this.isDestroyed && this.peer && !this.peer.destroyed) {
        setTimeout(() => this.peer?.reconnect(), 1000);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION ATTEMPTS (Guest)
  // ═══════════════════════════════════════════════════════════════════════════

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

      console.log(
        `[VoxLink Video] Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`,
      );
      this.connectToHost();
    };

    tryConnect();
    this.connectionAttemptInterval = setInterval(tryConnect, 2000);
  }

  private stopConnectionAttempts(): void {
    if (this.connectionAttemptInterval) {
      clearInterval(this.connectionAttemptInterval);
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

    console.log("[VoxLink Video] Connecting to host:", this.hostPeerId);

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
      console.log("[VoxLink Video] Data channel open");

      this.stopConnectionAttempts();
      this.connectionAttempts = 0;
      this.lastPongTime = Date.now();

      // Send hello
      this.send({ type: "hello", name: this.userName });

      // Start keep-alive
      this.startKeepAlive();

      // Guest initiates video call after data channel is ready
      if (!this.isHost && this.localStream) {
        setTimeout(() => this.initiateVideoCall(), 500);
      }

      this.setStatus("connected", "Connected!");
    });

    conn.on("data", (data: unknown) => {
      if (this.isDestroyed) return;
      this.handleDataMessage(data);
    });

    conn.on("close", () => {
      console.log("[VoxLink Video] Data channel closed");
      this.handlePartnerLeft();
    });

    conn.on("error", (err) => {
      console.error("[VoxLink Video] Data channel error:", err);
    });
  }

  private handleDataMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;

    const msg = data as Record<string, unknown>;

    // Room full message - 3rd person trying to join
    if (msg.type === "room_full") {
      console.log("[VoxLink Video] Room is full - cannot join");
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
      console.log("[VoxLink Video] Partner joined:", name);
      this.callbacks.onPartnerJoined?.(name);

      // Send hello back
      this.send({ type: "hello", name: this.userName });
      return;
    }

    // Forward other messages
    this.callbacks.onDataMessage?.(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIDEO CALL
  // ═══════════════════════════════════════════════════════════════════════════

  private initiateVideoCall(): void {
    if (!this.peer || !this.localStream || this.isDestroyed) return;

    // Don't create duplicate calls
    if (this.mediaConnection?.open) {
      return;
    }

    console.log("[VoxLink Video] Initiating video call to:", this.hostPeerId);

    const call = this.peer.call(this.hostPeerId, this.localStream);
    this.handleMediaConnection(call);
  }

  private handleMediaConnection(call: MediaConnection): void {
    // Avoid duplicate connections
    if (this.mediaConnection?.peer === call.peer && this.mediaConnection.open) {
      return;
    }

    // Close old connection
    if (this.mediaConnection) {
      try {
        this.mediaConnection.close();
      } catch {
        // Ignore
      }
    }

    this.mediaConnection = call;

    call.on("stream", (stream) => {
      if (this.isDestroyed) return;

      // Avoid duplicate stream events
      if (this.remoteStream?.id === stream.id) {
        return;
      }

      console.log("[VoxLink Video] Got remote stream!");
      this.remoteStream = stream;
      this.callbacks.onRemoteStream?.(stream);

      // Start quality monitoring when we have video
      this.startStatsMonitoring();
    });

    call.on("close", () => {
      console.log("[VoxLink Video] Media connection closed");
      this.remoteStream = null;
    });

    call.on("error", (err) => {
      console.error("[VoxLink Video] Media error:", err);
    });

    // Monitor ICE state
    const pc = (call as unknown as { peerConnection: RTCPeerConnection })
      .peerConnection;
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState as IceConnectionState;
        console.log("[VoxLink Video] ICE state:", state);

        // Notify UI of ICE state changes
        this.callbacks.onIceStateChange?.(state);

        if (state === "failed") {
          console.log("[VoxLink Video] ICE failed, restarting...");
          try {
            pc.restartIce?.();
          } catch {
            // Ignore
          }
        }

        if (state === "disconnected") {
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected" && !this.isDestroyed) {
              try {
                pc.restartIce?.();
              } catch {
                // Ignore
              }
            }
          }, 3000);
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
        console.warn("[VoxLink Video] No pong for 15s");
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
      console.warn("[VoxLink] Stats collection error:", err);
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
      console.error("[VoxLink Video] Send error:", err);
      return false;
    }
  }

  disconnect(): void {
    console.log("[VoxLink Video] Disconnecting...");
    this.isDestroyed = true;

    this.stopKeepAlive();
    this.stopStatsMonitoring();
    this.stopConnectionAttempts();

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
    console.log("[VoxLink Video] Status:", status, message || "");
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
    // HD
    {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    // SD fallback
    {
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    },
    // Minimum
    { video: true, audio: true },
  ];

  for (const constraint of constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      console.log("[VoxLink Video] Camera acquired");
      return stream;
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          throw new Error("Camera access denied. Please allow camera access.");
        }
        if (err.name === "NotFoundError") {
          throw new Error("No camera found on this device.");
        }
      }
      // Try next constraint
    }
  }

  throw new Error("Could not access camera");
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
