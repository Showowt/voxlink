import { RoomSignal } from "./room-signal";

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
// ENTREVOZ VIDEO CONNECTION v3.0 — Pure WebRTC + Supabase Realtime Signaling
// Eliminated PeerJS cloud server (0.peerjs.com) — single point of failure.
// All signaling now goes through Supabase Realtime (production-grade).
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
  quality: "excellent" | "good" | "fair" | "poor";
  packetLoss: number;
  rtt: number;
  jitter: number;
  bandwidth: number;
  timestamp: number;
}

export interface PartnerInfo {
  name: string;
  deviceId?: string;
  lang?: string;
}

export interface PeerCallbacks {
  onStatusChange?: (status: ConnectionStatus, message?: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onDataMessage?: (data: unknown) => void;
  onPartnerJoined?: (name: string) => void;
  onPartnerInfo?: (info: PartnerInfo) => void;
  onPartnerLeft?: () => void;
  onError?: (error: string) => void;
  onIceStateChange?: (state: IceConnectionState) => void;
  onQualityUpdate?: (quality: ConnectionQuality) => void;
}

// Default ICE servers (STUN only — TURN fetched from API)
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

export class PeerConnection {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private roomId = "";
  private isHost = false;
  private userName = "";
  private deviceId = "";
  private lang = "";
  private iceServers: RTCIceServer[] = [];

  private _status: ConnectionStatus = "initializing";
  private callbacks: PeerCallbacks = {};
  private isDestroyed = false;
  private pendingMessages: unknown[] = [];
  private helloAcknowledged = false;

  // Retry logic
  private connectionAttempts = 0;
  private maxConnectionAttempts = 30;
  private connectionAttemptTimeout: NodeJS.Timeout | null = null;

  // Keep-alive
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPongTime = Date.now();
  private missedPongs = 0;
  private static readonly MAX_MISSED_PONGS = 2;

  // Quality monitoring
  private statsInterval: NodeJS.Timeout | null = null;
  private previousStats: {
    packetsReceived: number;
    packetsLost: number;
    bytesReceived: number;
    timestamp: number;
  } | null = null;

  // Video retry
  private videoRetryTimeout: NodeJS.Timeout | null = null;
  private videoRetryAttempts = 0;
  private static readonly MAX_VIDEO_RETRIES = 6;
  private streamTimeoutId: NodeJS.Timeout | null = null;
  private streamReceived = false;
  private static readonly DEFAULT_STREAM_TIMEOUT = 8000;

  // Supabase signaling
  private roomSignal: RoomSignal | null = null;
  private peerPresent = false;

  // ICE candidate queue (candidates arriving before remote description is set)
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescSet = false;

  // Cached offer — reuse on retries instead of creating new PC each time
  private currentOffer: RTCSessionDescriptionInit | null = null;

  // Network change detection
  private networkChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;
  private lastNetworkType: string | null = null;
  private isOffline = false;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
    this.setupNetworkListeners();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK CHANGE DETECTION — Proactive ICE restart on network switch
  // ═══════════════════════════════════════════════════════════════════════════

  private setupNetworkListeners(): void {
    if (typeof window === "undefined") return;

    this.onlineHandler = () => {
      console.log("[Entrevoz] Network: Back online");
      this.isOffline = false;
      if (this._status === "connected" || this._status === "reconnecting") {
        this.triggerIceRestart();
      }
    };

    this.offlineHandler = () => {
      console.log("[Entrevoz] Network: Went offline");
      this.isOffline = true;
      if (this._status === "connected") {
        this.setStatus("reconnecting", "Network offline...");
      }
    };

    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection) {
      this.lastNetworkType = connection.type || connection.effectiveType || null;
      this.networkChangeHandler = () => {
        const newType = connection.type || connection.effectiveType || null;
        console.log(`[Entrevoz] Network type changed: ${this.lastNetworkType} → ${newType}`);
        if (newType !== this.lastNetworkType && this._status === "connected") {
          this.triggerIceRestart();
        }
        this.lastNetworkType = newType;
      };
      connection.addEventListener("change", this.networkChangeHandler);
    }
  }

  private removeNetworkListeners(): void {
    if (typeof window === "undefined") return;
    if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
    if (this.offlineHandler) window.removeEventListener("offline", this.offlineHandler);
    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection && this.networkChangeHandler) {
      connection.removeEventListener("change", this.networkChangeHandler);
    }
  }

  private triggerIceRestart(): void {
    if (!this.pc || this.isDestroyed) return;
    try {
      if (this.pc.iceConnectionState !== "closed") {
        console.log("[Entrevoz] Restarting ICE...");
        this.pc.restartIce?.();
      }
    } catch (err) {
      console.warn("[Entrevoz] ICE restart failed:", err);
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
    options?: { deviceId?: string; lang?: string },
  ): Promise<boolean> {
    this.roomId = roomId.toUpperCase();
    this.isHost = isHost;
    this.userName = userName;
    this.deviceId = options?.deviceId || "";
    this.lang = options?.lang || "";
    this.localStream = localStream || null;
    this.isDestroyed = false;
    this.connectionAttempts = 0;
    this.peerPresent = false;

    this.setStatus("initializing", "Connecting...");

    try {
      // Fetch ICE servers (TURN credentials from server)
      this.iceServers = await getIceServers();
      console.log(`[Entrevoz] ICE servers fetched: ${this.iceServers.length} servers`);

      // Start Supabase Realtime signaling — this is the ONLY signaling channel
      this.roomSignal = new RoomSignal();
      const signalingOk = await this.roomSignal.start(
        this.roomId,
        isHost ? "host" : "guest",
        {
          onPeerPresent: (role) => {
            if (this.isDestroyed) return;
            console.log(`[Entrevoz] Peer present: ${role}`);
            const wasPresent = this.peerPresent;
            this.peerPresent = true;

            // Guest: host showed up — immediately send offer if we have one
            if (!this.isHost && this._status !== "connected") {
              if (this.currentOffer && this.roomSignal?.isActive) {
                // Re-broadcast existing offer immediately (host just subscribed)
                console.log("[Entrevoz] Host detected — re-broadcasting offer");
                this.roomSignal.sendOffer(this.currentOffer);
              } else if (!wasPresent) {
                // First time seeing host — start connection attempts
                this.startConnectionAttempts();
              }
            }
          },

          onOffer: (sdp) => {
            if (this.isDestroyed) return;
            this.handleRemoteOffer(sdp);
          },

          onAnswer: (sdp) => {
            if (this.isDestroyed) return;
            this.handleRemoteAnswer(sdp);
          },

          onCandidate: (candidate) => {
            if (this.isDestroyed) return;
            this.handleRemoteCandidate(candidate);
          },

          onPeerLeft: () => {
            if (this.isDestroyed) return;
            this.handlePartnerLeft();
          },
        },
      );

      if (!signalingOk) {
        throw new Error("Failed to start signaling — check Supabase configuration");
      }

      if (isHost) {
        this.setStatus("waiting", "Waiting for partner...");
        // Host is passive — RoomSignal.onOffer will trigger connection
      } else {
        this.setStatus("connecting", "Looking for host...");
        // Guest starts trying immediately — host presence isn't required up front
        // because the guest's offer will be waiting when the host arrives
        this.startConnectionAttempts();
      }

      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Connection failed";
      console.error("[Entrevoz] Init error:", err);
      this.setStatus("failed", errorMessage);
      this.callbacks.onError?.(errorMessage);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RTCPeerConnection FACTORY
  // ═══════════════════════════════════════════════════════════════════════════

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    // ── Send ICE candidates to remote peer via Supabase ─────────────────
    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomSignal?.isActive) {
        this.roomSignal.sendCandidate(event.candidate.toJSON());
      }
    };

    // ── Receive remote media tracks ─────────────────────────────────────
    pc.ontrack = (event) => {
      if (this.isDestroyed) return;

      const stream = event.streams[0];
      if (!stream) return;

      // Avoid duplicate stream events
      if (this.remoteStream?.id === stream.id) return;

      console.log("[Entrevoz] Remote stream received!", {
        streamId: stream.id,
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      this.streamReceived = true;
      this.clearStreamTimeout();
      this.clearVideoRetryTimeout();
      this.videoRetryAttempts = 0;

      this.remoteStream = stream;
      this.callbacks.onRemoteStream?.(stream);

      if (this._status !== "connected") {
        this.setStatus("connected", "Connected!");
      }
      this.startStatsMonitoring();
    };

    // ── Host receives data channel created by guest ─────────────────────
    pc.ondatachannel = (event) => {
      if (this.isDestroyed) return;
      console.log("[Entrevoz] Received data channel");
      this.setupDataChannel(event.channel);
    };

    // ── ICE + connection state monitoring ────────────────────────────────
    this.setupIceMonitoring(pc);

    return pc;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ICE STATE MONITORING
  // ═══════════════════════════════════════════════════════════════════════════

  private setupIceMonitoring(pc: RTCPeerConnection): void {
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState as IceConnectionState;
      console.log("[Entrevoz] ICE state:", state);
      this.callbacks.onIceStateChange?.(state);

      if (state === "failed") {
        console.log("[Entrevoz] ICE failed, attempting restart...");
        try {
          pc.restartIce?.();
        } catch (err) {
          console.error("[Entrevoz] ICE restart failed:", err);
          if (!this.streamReceived && !this.isDestroyed && this._status !== "failed") {
            this.handleConnectionError("ICE connection failed");
          }
        }
      }

      if (state === "disconnected") {
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && !this.isDestroyed) {
            console.log("[Entrevoz] ICE still disconnected after 1.5s, restarting...");
            try { pc.restartIce?.(); } catch { /* ignore */ }
            // If still disconnected after another 3s, full renegotiation
            setTimeout(() => {
              if (pc.iceConnectionState === "disconnected" && !this.isDestroyed) {
                console.log("[Entrevoz] ICE still disconnected — renegotiating...");
                this.videoRetryAttempts = 0;
                this.renegotiate();
              }
            }, 3000);
          }
        }, 1500);
      }

      if (state === "connected" || state === "completed") {
        console.log("[Entrevoz] ICE connection established");
        this.applyBandwidthLimits(pc);
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[Entrevoz] ICE gathering:", pc.iceGatheringState);
    };

    pc.onconnectionstatechange = () => {
      console.log("[Entrevoz] Connection state:", pc.connectionState);
      if (pc.connectionState === "failed" && !this.isDestroyed) {
        if (!this.streamReceived && this._status !== "failed") {
          this.handleConnectionError("Peer connection failed");
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BANDWIDTH LIMITS — Defer until ICE connects (iOS Safari safety)
  // ═══════════════════════════════════════════════════════════════════════════

  private applyBandwidthLimits(pc: RTCPeerConnection): void {
    try {
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        if (params.encodings.length === 0) continue;
        if (sender.track.kind === "video") {
          params.encodings[0].maxBitrate = 500000;
          params.encodings[0].scaleResolutionDownBy = 1;
        } else if (sender.track.kind === "audio") {
          params.encodings[0].maxBitrate = 64000;
        }
        sender.setParameters(params).catch(() => { /* older browsers */ });
      }
    } catch {
      // setParameters not supported — bandwidth will be uncapped
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUEST: CONNECTION ATTEMPTS — Exponential Backoff with Jitter
  // ═══════════════════════════════════════════════════════════════════════════

  private static readonly FAST_RETRY_COUNT = 6;
  private static readonly FAST_RETRY_DELAY = 2000; // 2s between re-broadcasts (was 500ms — too fast, caused race conditions)
  private static readonly BASE_DELAY = 1500;
  private static readonly MAX_DELAY = 10000;
  private static readonly BACKOFF_FACTOR = 1.8;
  private static readonly JITTER_FACTOR = 0.15;

  private calculateBackoffDelay(): number {
    if (this.connectionAttempts <= PeerConnection.FAST_RETRY_COUNT) {
      return PeerConnection.FAST_RETRY_DELAY;
    }
    const attemptsSinceFast = this.connectionAttempts - PeerConnection.FAST_RETRY_COUNT;
    const exponentialDelay =
      PeerConnection.BASE_DELAY *
      Math.pow(PeerConnection.BACKOFF_FACTOR, attemptsSinceFast - 1);
    const cappedDelay = Math.min(exponentialDelay, PeerConnection.MAX_DELAY);
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
        `[Entrevoz] Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts} (next in ${delay}ms)`,
      );

      // First attempt: create PC + offer. Retries: re-broadcast same offer.
      // This prevents race conditions where host answers an old offer
      // that no longer matches the guest's current PC.
      if (!this.pc || !this.currentOffer) {
        this.initiateConnection();
      } else if (this.roomSignal?.isActive && this.currentOffer) {
        // Re-broadcast existing offer in case host missed it
        this.roomSignal.sendOffer(this.currentOffer);
        console.log("[Entrevoz] Re-broadcast existing offer");
      }

      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.connectionAttemptTimeout = setTimeout(tryConnect, delay);
      }
    };

    tryConnect();
  }

  private stopConnectionAttempts(): void {
    if (this.connectionAttemptTimeout) {
      clearTimeout(this.connectionAttemptTimeout);
      this.connectionAttemptTimeout = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUEST: Create offer and send via Supabase
  // ═══════════════════════════════════════════════════════════════════════════

  private async initiateConnection(): Promise<void> {
    if (this.isDestroyed) return;

    // Don't re-initiate if already connected
    if (this.dataChannel?.readyState === "open" && this.remoteStream) {
      this.stopConnectionAttempts();
      return;
    }

    // Tear down any existing connection
    this.closePeerConnection();
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.streamReceived = false;

    const pc = this.createPeerConnection();
    this.pc = pc;

    // Guest creates the data channel
    const dc = pc.createDataChannel("entrevoz", { ordered: true });
    this.setupDataChannel(dc);

    // Add local media tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.currentOffer = { type: offer.type, sdp: offer.sdp };
      this.roomSignal?.sendOffer(this.currentOffer);
      console.log("[Entrevoz] SDP offer sent via Supabase");

      // Set stream timeout
      const timeout = this.getStreamTimeout();
      this.streamTimeoutId = setTimeout(() => {
        if (this.isDestroyed || this.streamReceived || this.remoteStream) return;
        console.warn(`[Entrevoz] Stream timeout after ${timeout}ms`);
        this.handleConnectionError("Stream timeout - partner may not have video enabled");
      }, timeout);
    } catch (err) {
      console.error("[Entrevoz] Failed to create offer:", err);
      this.handleConnectionError("Failed to create connection offer");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOST: Handle incoming offer, create answer
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleRemoteOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isHost || this.isDestroyed) return;

    // Room full — already connected to someone
    if (this._status === "connected" && this.dataChannel?.readyState === "open") {
      console.log("[Entrevoz] Room full — ignoring new offer");
      return;
    }

    // If we already have a PC processing this same offer (re-broadcast), just re-send our answer
    // This prevents tearing down a working PC when guest re-broadcasts the same offer
    if (this.pc && this.remoteDescSet && this.currentOffer) {
      console.log("[Entrevoz] Host already processing offer — re-sending answer");
      this.roomSignal?.sendAnswer(this.currentOffer);
      return;
    }

    console.log("[Entrevoz] Host received offer — creating answer");

    // Tear down existing connection
    this.closePeerConnection();
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.streamReceived = false;

    const pc = this.createPeerConnection();
    this.pc = pc;

    // Add local media tracks BEFORE setting remote description
    // CRITICAL for iOS Safari: tracks must be added before createAnswer
    // If stream is not ready yet, wait up to 5s (same as old PeerJS behavior)
    if (!this.localStream) {
      console.warn("[Entrevoz] No localStream — waiting up to 5s for media...");
      for (let i = 0; i < 50; i++) {
        if (this.localStream || this.isDestroyed) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const streamToAdd = this.localStream;
    if (streamToAdd) {
      for (const track of streamToAdd.getTracks()) {
        pc.addTrack(track, streamToAdd);
      }
      if (!this.localStream) {
        // Was null initially but acquired during wait
        console.log("[Entrevoz] localStream acquired — added tracks");
      }
    } else {
      console.error("[Entrevoz] No localStream — answering without media (one-way audio likely)");
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescSet = true;

      // Flush queued ICE candidates
      for (const candidate of this.pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      this.pendingCandidates = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const answerSdp = { type: answer.type, sdp: answer.sdp } as RTCSessionDescriptionInit;
      this.currentOffer = answerSdp; // Cache answer for re-send on duplicate offers
      this.roomSignal?.sendAnswer(answerSdp);
      console.log("[Entrevoz] SDP answer sent via Supabase");

      this.setStatus("connecting", "Establishing video...");

      // Set stream timeout
      const timeout = this.getStreamTimeout();
      this.streamTimeoutId = setTimeout(() => {
        if (this.isDestroyed || this.streamReceived || this.remoteStream) return;
        console.warn(`[Entrevoz] Stream timeout after ${timeout}ms`);
        // Host doesn't retry — guest drives the retry loop
      }, timeout);
    } catch (err) {
      console.error("[Entrevoz] Failed to handle offer:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUEST: Handle incoming answer
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleRemoteAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.isHost || this.isDestroyed || !this.pc) return;

    console.log("[Entrevoz] Guest received answer — applying");

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescSet = true;

      // Flush queued ICE candidates
      for (const candidate of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      this.pendingCandidates = [];

      // Answer received means host is alive — stop retrying
      this.stopConnectionAttempts();
      this.connectionAttempts = 0;
    } catch (err) {
      console.error("[Entrevoz] Failed to apply answer:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ICE CANDIDATE HANDLING — Queue until remote desc is set
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.isDestroyed || !this.pc) return;

    if (!this.remoteDescSet) {
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("[Entrevoz] Failed to add ICE candidate:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════

  private setupDataChannel(dc: RTCDataChannel): void {
    // Close old channel if different
    if (this.dataChannel && this.dataChannel !== dc) {
      try { this.dataChannel.close(); } catch { /* ignore */ }
    }

    this.dataChannel = dc;

    dc.onopen = () => {
      if (this.isDestroyed) return;
      console.log("[Entrevoz] Data channel open");

      this.stopConnectionAttempts();
      this.connectionAttempts = 0;
      this.videoRetryAttempts = 0;
      this.lastPongTime = Date.now();

      // Flush queued messages
      if (this.pendingMessages.length > 0) {
        console.log(`[Entrevoz] Flushing ${this.pendingMessages.length} queued messages`);
        const queued = this.pendingMessages.splice(0);
        for (const msg of queued) {
          try { dc.send(JSON.stringify(msg)); } catch { /* skip stale */ }
        }
      }

      // Send hello
      this.send({ type: "hello", name: this.userName, deviceId: this.deviceId, lang: this.lang });

      // Start keep-alive
      this.startKeepAlive();

      this.setStatus("connecting", "Establishing video...");
    };

    dc.onmessage = (event) => {
      if (this.isDestroyed) return;
      try {
        const data = JSON.parse(event.data);
        this.handleDataMessage(data);
      } catch {
        // Non-JSON message — ignore
      }
    };

    dc.onclose = () => {
      console.log("[Entrevoz] Data channel closed");
      this.handlePartnerLeft();
    };

    dc.onerror = (err) => {
      console.error("[Entrevoz] Data channel error:", err);
    };
  }

  private handleDataMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;

    // Room full
    if (msg.type === "room_full") {
      this.stopConnectionAttempts();
      this.setStatus("room_full", "This room is full. Only 2 participants allowed.");
      this.callbacks.onError?.("This room is full. Only 2 participants allowed.");
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

    // Hello
    if (msg.type === "hello") {
      const name = String(msg.name || "Partner");
      const partnerDeviceId = msg.deviceId ? String(msg.deviceId) : undefined;
      const partnerLang = msg.lang ? String(msg.lang) : undefined;
      console.log("[Entrevoz] Partner joined:", name);
      this.callbacks.onPartnerJoined?.(name);
      this.callbacks.onPartnerInfo?.({ name, deviceId: partnerDeviceId, lang: partnerLang });

      if (this._status !== "connected") {
        this.setStatus("connected", "Connected!");
      }

      // Acknowledge once (prevent infinite ping-pong)
      if (!this.helloAcknowledged) {
        this.helloAcknowledged = true;
        this.send({ type: "hello", name: this.userName, deviceId: this.deviceId, lang: this.lang });
      }
      return;
    }

    // Forward other messages
    this.callbacks.onDataMessage?.(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENEGOTIATION — Tear down and rebuild RTCPeerConnection
  // ═══════════════════════════════════════════════════════════════════════════

  private renegotiate(): void {
    if (this.isDestroyed) return;
    console.log("[Entrevoz] Renegotiating connection...");

    // Reset cached offer so next attempt creates fresh PC + offer
    this.currentOffer = null;
    this.closePeerConnection();

    // Guest drives the connection — send a new offer
    if (!this.isHost) {
      this.initiateConnection();
    }
    // Host: the guest will send a new offer through the retry loop
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING WITH RETRY
  // ═══════════════════════════════════════════════════════════════════════════

  private handleConnectionError(reason: string): void {
    console.error(`[Entrevoz] Connection error: ${reason}`);
    this.clearStreamTimeout();
    this.clearVideoRetryTimeout();

    this.videoRetryAttempts++;

    if (this.videoRetryAttempts < PeerConnection.MAX_VIDEO_RETRIES && !this.isDestroyed) {
      const retryDelay = Math.min(1500 * Math.pow(1.3, this.videoRetryAttempts - 1), 6000);
      console.log(
        `[Entrevoz] Scheduling retry in ${retryDelay}ms (attempt ${this.videoRetryAttempts + 1}/${PeerConnection.MAX_VIDEO_RETRIES})`,
      );
      this.setStatus("reconnecting", `Retrying... (${this.videoRetryAttempts}/${PeerConnection.MAX_VIDEO_RETRIES})`);

      this.videoRetryTimeout = setTimeout(() => {
        if (!this.isDestroyed && this.localStream && this.roomSignal?.isActive) {
          this.renegotiate();
        }
      }, retryDelay);
    } else if (!this.isDestroyed) {
      console.error("[Entrevoz] Max retries exhausted");
      this.setStatus("failed", "Video connection failed - please refresh and try again");
      this.callbacks.onError?.(`Video connection failed: ${reason}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTIVE STREAM TIMEOUT
  // ═══════════════════════════════════════════════════════════════════════════

  private getStreamTimeout(): number {
    try {
      const connection = (navigator as NavigatorWithConnection).connection;
      const effectiveType = connection?.effectiveType || "4g";
      const timeouts: Record<string, number> = {
        "slow-2g": 25000,
        "2g": 20000,
        "3g": 15000,
        "4g": 8000,
      };
      return timeouts[effectiveType] || PeerConnection.DEFAULT_STREAM_TIMEOUT;
    } catch {
      return PeerConnection.DEFAULT_STREAM_TIMEOUT;
    }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // KEEP-ALIVE — 3s ping/pong, fast dead connection detection
  // ═══════════════════════════════════════════════════════════════════════════

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.missedPongs = 0;

    this.keepAliveInterval = setInterval(() => {
      if (this.dataChannel?.readyState !== "open") {
        this.stopKeepAlive();
        return;
      }

      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > 8000) {
        this.missedPongs++;
        console.warn(
          `[Entrevoz] No pong for ${Math.round(timeSinceLastPong / 1000)}s (missed: ${this.missedPongs}/${PeerConnection.MAX_MISSED_PONGS})`,
        );
        if (this.missedPongs >= PeerConnection.MAX_MISSED_PONGS) {
          console.warn("[Entrevoz] Connection dead — triggering ICE restart");
          this.missedPongs = 0;
          this.triggerIceRestart();
        }
      } else {
        this.missedPongs = 0;
      }

      this.send({ type: "ping", time: Date.now() });
    }, 3000);
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
    this.helloAcknowledged = false;
    this.callbacks.onPartnerLeft?.();
    this.remoteStream = null;

    if (this._status === "connected" && !this.isDestroyed) {
      this.setStatus("waiting", "Partner disconnected");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY MONITORING — RTCPeerConnection.getStats()
  // ═══════════════════════════════════════════════════════════════════════════

  private startStatsMonitoring(): void {
    this.stopStatsMonitoring();
    this.statsInterval = setInterval(() => this.collectStats(), 2000);
  }

  private stopStatsMonitoring(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.previousStats = null;
  }

  private async collectStats(): Promise<void> {
    if (!this.pc || this.isDestroyed) return;

    try {
      const stats = await this.pc.getStats();
      let packetsReceived = 0;
      let packetsLost = 0;
      let bytesReceived = 0;
      let jitter = 0;
      let rtt = 0;

      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          packetsReceived = report.packetsReceived || 0;
          packetsLost = report.packetsLost || 0;
          jitter = (report.jitter || 0) * 1000;
          bytesReceived = report.bytesReceived || 0;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
        }
      });

      const now = Date.now();
      let packetLoss = 0;
      let bandwidth = 0;

      if (this.previousStats) {
        const timeDelta = (now - this.previousStats.timestamp) / 1000;
        const packetsInPeriod = packetsReceived - this.previousStats.packetsReceived;
        const lostInPeriod = packetsLost - this.previousStats.packetsLost;
        const bytesInPeriod = bytesReceived - this.previousStats.bytesReceived;

        if (packetsInPeriod + lostInPeriod > 0) {
          packetLoss = (lostInPeriod / (packetsInPeriod + lostInPeriod)) * 100;
        }
        bandwidth = timeDelta > 0 ? (bytesInPeriod * 8) / timeDelta / 1000 : 0;
      }

      this.previousStats = { packetsReceived, packetsLost, bytesReceived, timestamp: now };

      let quality: ConnectionQuality["quality"] = "excellent";
      if (packetLoss > 10 || rtt > 300) quality = "poor";
      else if (packetLoss > 5 || rtt > 200) quality = "fair";
      else if (packetLoss > 2 || rtt > 100) quality = "good";

      this.callbacks.onQualityUpdate?.({
        quality,
        packetLoss: Math.round(packetLoss * 10) / 10,
        rtt: Math.round(rtt),
        jitter: Math.round(jitter),
        bandwidth: Math.round(bandwidth),
        timestamp: now,
      });
    } catch (err) {
      console.warn("[Entrevoz] Stats collection error:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  private closePeerConnection(): void {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch { /* ignore */ }
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* ignore */ }
      this.pc = null;
    }
    this.remoteStream = null;
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.currentOffer = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  send(data: unknown): boolean {
    if (this.isDestroyed) return false;

    if (this.dataChannel?.readyState !== "open") {
      if (this.pendingMessages.length < 50) {
        this.pendingMessages.push(data);
      }
      return false;
    }

    try {
      this.dataChannel.send(JSON.stringify(data));
      return true;
    } catch (err) {
      console.error("[Entrevoz] Send error:", err);
      if (this.pendingMessages.length < 50) {
        this.pendingMessages.push(data);
      }
      return false;
    }
  }

  disconnect(): void {
    console.log("[Entrevoz] Disconnecting...");
    this.isDestroyed = true;
    this.pendingMessages.length = 0;

    this.stopKeepAlive();
    this.stopStatsMonitoring();
    this.stopConnectionAttempts();
    this.clearVideoRetryTimeout();
    this.clearStreamTimeout();
    this.removeNetworkListeners();

    // Stop Supabase signaling (sends leave message)
    if (this.roomSignal) {
      this.roomSignal.stop();
      this.roomSignal = null;
    }

    // Release reference to local stream — track cleanup is caller's responsibility
    this.localStream = null;

    this.closePeerConnection();
    this.connectionAttempts = 0;
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this.isDestroyed) return;
    this._status = status;
    console.log("[Entrevoz] Status:", status, message || "");
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
    {
      video: {
        facingMode,
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    {
      video: {
        facingMode,
        width: { ideal: 480 },
        height: { ideal: 360 },
        frameRate: { ideal: 20 },
      },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    },
    { video: true, audio: { echoCancellation: true, noiseSuppression: true } },
    { video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
    { video: false, audio: true },
  ];

  let lastError: Error | null = null;

  for (const constraint of constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint);
      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;
      console.log(`[Entrevoz] Media acquired - Video: ${hasVideo}, Audio: ${hasAudio}`);
      return stream;
    } catch (err: unknown) {
      if (err instanceof Error) {
        lastError = err;
        if (err.name === "NotAllowedError") {
          throw new Error("Camera/microphone access denied. Please allow access in browser settings.");
        }
      }
    }
  }

  throw lastError || new Error("Could not access camera or microphone");
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
