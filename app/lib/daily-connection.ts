import DailyIframe, {
  DailyCall,
  DailyParticipant,
} from "@daily-co/daily-js";

// Import types from peer-connection to ensure interface compatibility
import type {
  ConnectionMode,
  ConnectionStatus,
  ConnectionQuality,
  PeerCallbacks,
} from "./peer-connection";

export class DailyConnection {
  private call: DailyCall | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private _status: ConnectionStatus = "initializing";
  private callbacks: PeerCallbacks = {};
  private isDestroyed = false;
  private roomId = "";
  private isHost = false;
  private userName = "";
  private deviceId = "";
  private lang = "";
  private helloAcknowledged = false;
  private pendingMessages: unknown[] = [];
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = Date.now();
  private statsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === "connected";
  }

  async connect(
    roomId: string,
    isHost: boolean,
    userName: string,
    _mode: ConnectionMode,
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

    this.setStatus("initializing", "Connecting...");

    try {
      // Create or get the Daily.co room
      const roomRes = await fetch("/api/daily/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: this.roomId }),
      });

      if (!roomRes.ok) {
        throw new Error("Failed to create video room");
      }

      const roomData: { url: string; name: string; created: boolean } =
        await roomRes.json();
      const roomUrl = roomData.url;
      console.log("[Daily] Room URL:", roomUrl);

      // Create the Daily call object — let Daily manage its OWN mic and camera.
      // Do NOT pass our localStream tracks here. Sharing audio tracks between
      // Daily.co and Web Speech API causes iOS Safari to kill audio to one consumer.
      // Daily will call getUserMedia internally with its own exclusive tracks.
      this.call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: true,
        dailyConfig: {
          keepCamIndicatorLightOn: false,
        },
      });

      // Set up event listeners BEFORE joining
      this.setupDailyListeners();

      // Join the room
      this.setStatus(
        isHost ? "waiting" : "connecting",
        isHost ? "Waiting for partner..." : "Joining...",
      );

      await this.call.join({
        url: roomUrl,
        userName: this.userName,
      });

      console.log("[Daily] Joined room successfully");

      // Check if partner is already in the room
      const participants = this.call.participants();
      const remoteParticipants = Object.values(participants).filter(
        (p) => !p.local,
      );
      if (remoteParticipants.length > 0) {
        this.handleParticipantJoined(remoteParticipants[0]);
      } else if (isHost) {
        this.setStatus("waiting", "Waiting for partner...");
      }

      return true;
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      console.error("[Daily] Init error:", err);
      this.setStatus("failed", errorMessage);
      this.callbacks.onError?.(errorMessage);
      return false;
    }
  }

  private setupDailyListeners(): void {
    if (!this.call) return;

    // Participant joined
    this.call.on("participant-joined", (event) => {
      if (this.isDestroyed || !event) return;
      const participant = event.participant;
      if (participant.local) return; // Ignore ourselves
      this.handleParticipantJoined(participant);
    });

    // Participant left
    this.call.on("participant-left", (event) => {
      if (this.isDestroyed) return;
      if (event?.participant?.local) return;
      console.log("[Daily] Partner left");
      this.callbacks.onPartnerLeft?.();
      this.setStatus("waiting", "Partner disconnected");
    });

    // Track started (remote video/audio)
    // Fires ONCE PER TRACK — audio may arrive before video.
    // We maintain a single MediaStream and add tracks to it incrementally,
    // then re-fire onRemoteStream each time so the video element updates.
    this.call.on("track-started", (event) => {
      if (this.isDestroyed || !event) return;
      const { participant, track } = event;
      if (!participant || participant.local || !track) return;

      console.log("[Daily] Remote track started:", track.kind);

      // Add track to our persistent remote stream
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      // Remove existing track of same kind (replace, don't duplicate)
      const existing = this.remoteStream.getTracks().filter(t => t.kind === track.kind);
      for (const old of existing) {
        this.remoteStream.removeTrack(old);
      }
      this.remoteStream.addTrack(track);

      console.log("[Daily] Remote stream updated:", {
        videoTracks: this.remoteStream.getVideoTracks().length,
        audioTracks: this.remoteStream.getAudioTracks().length,
      });

      // Fire callback every time — the call page will update the video element
      this.callbacks.onRemoteStream?.(this.remoteStream);
    });

    // App message (data channel replacement)
    this.call.on("app-message", (event) => {
      if (this.isDestroyed || !event) return;
      if (event.fromId === "local") return;
      this.handleDataMessage(event.data);
    });

    // Error handling
    this.call.on("error", (event) => {
      console.error("[Daily] Error:", event);
      if (!this.isDestroyed) {
        this.callbacks.onError?.(event?.errorMsg || "Connection error");
      }
    });

    // Network quality changes
    this.call.on("network-quality-change", (event) => {
      if (!event) return;
      const threshold = event.threshold;
      const quality: ConnectionQuality["quality"] =
        threshold === "good"
          ? "excellent"
          : threshold === "low"
            ? "fair"
            : "good";
      this.callbacks.onQualityUpdate?.({
        quality,
        packetLoss: 0,
        rtt: 0,
        jitter: 0,
        bandwidth: 0,
        timestamp: Date.now(),
      });
    });

    // Nonfatal error — connection recovered
    this.call.on("nonfatal-error", (event) => {
      console.warn("[Daily] Nonfatal:", event);
    });
  }

  private handleParticipantJoined(participant: DailyParticipant): void {
    const name = participant.user_name || "Partner";
    console.log("[Daily] Partner joined:", name);
    this.callbacks.onPartnerJoined?.(name);
    this.callbacks.onPartnerInfo?.({ name });
    this.setStatus("connected", "Connected!");

    // Send hello
    this.send({
      type: "hello",
      name: this.userName,
      deviceId: this.deviceId,
      lang: this.lang,
    });

    // Start keep-alive
    this.startKeepAlive();
  }

  private handleDataMessage(data: unknown): void {
    if (!data || typeof data !== "object") return;
    const msg = data as Record<string, unknown>;

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
      this.callbacks.onPartnerJoined?.(name);
      this.callbacks.onPartnerInfo?.({
        name,
        deviceId: partnerDeviceId,
        lang: partnerLang,
      });
      if (this._status !== "connected") {
        this.setStatus("connected", "Connected!");
      }
      if (!this.helloAcknowledged) {
        this.helloAcknowledged = true;
        this.send({
          type: "hello",
          name: this.userName,
          deviceId: this.deviceId,
          lang: this.lang,
        });
      }
      return;
    }

    // Forward other messages (captions, transcription, translation)
    this.callbacks.onDataMessage?.(data);
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      this.send({ type: "ping", time: Date.now() });
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  // PUBLIC API (same interface as PeerConnection)

  send(data: unknown): boolean {
    if (this.isDestroyed || !this.call) return false;

    try {
      this.call.sendAppMessage(data, "*");
      return true;
    } catch (err) {
      console.error("[Daily] Send error:", err);
      if (this.pendingMessages.length < 50) {
        this.pendingMessages.push(data);
      }
      return false;
    }
  }

  disconnect(): void {
    console.log("[Daily] Disconnecting...");
    this.isDestroyed = true;
    this.stopKeepAlive();
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.localStream = null;
    this.remoteStream = null;

    if (this.call) {
      try {
        this.call.leave();
      } catch {
        /* ignore */
      }
      try {
        this.call.destroy();
      } catch {
        /* ignore */
      }
      this.call = null;
    }
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this.isDestroyed) return;
    this._status = status;
    console.log("[Daily] Status:", status, message || "");
    this.callbacks.onStatusChange?.(status, message);
  }
}
