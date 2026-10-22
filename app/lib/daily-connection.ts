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
import { diag } from "./diag";

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
  // Liveness while WAITING for a partner. Without this, a host that misses the
  // single 'participant-joined' event (native WKWebView suspended during a long
  // ring, or a silently-dead SFU socket) is stranded in 'waiting' forever and
  // never connects — the primary "both joined, no media" root cause.
  private waitWatchdog: ReturnType<typeof setInterval> | null = null;
  private waitStartedAt = 0;
  private waitBeaconed = false;

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
        body: JSON.stringify({ roomCode: this.roomId, deviceId: this.deviceId, isHost: this.isHost }),
      });

      if (!roomRes.ok) {
        // 402 = free monthly video minutes exhausted (audio stays unlimited) —
        // surface a distinct message so the UI can offer the audio call path.
        const errBody = await roomRes.json().catch(() => ({}) as { error?: string; videoLimit?: boolean });
        diag("daily-join-failed", {
          room: this.roomId,
          status: roomRes.status,
          reason: errBody.videoLimit ? "video-limit" : "room-create",
          isHost: this.isHost,
        });
        if (roomRes.status === 402 && errBody.videoLimit) {
          throw new Error(errBody.error || "Free video minutes used — audio calls are unlimited");
        }
        throw new Error("Failed to create video room");
      }

      const roomData: {
        url: string;
        name: string;
        created: boolean;
        token?: string;
      } = await roomRes.json();
      const roomUrl = roomData.url;
      const roomToken = roomData.token;
      console.log("[Daily] Room URL:", roomUrl);

      // Daily permits only ONE call object per page. A fast re-dial / navigation
      // between rooms can leave a previous instance alive → createCallObject
      // throws "Duplicate DailyIframe instances are not allowed" and the new call
      // never joins (seen in diag as daily-join-failed on rapid redials). Tear
      // down any lingering instance before creating ours.
      try {
        const existing = DailyIframe.getCallInstance();
        if (existing) {
          try { await existing.leave(); } catch { /* ignore */ }
          try { existing.destroy(); } catch { /* ignore */ }
        }
      } catch {
        /* getCallInstance unsupported — ignore */
      }

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
        ...(roomToken ? { token: roomToken } : {}),
      });

      console.log("[Daily] Joined room successfully");
      diag("daily-joined", { room: this.roomId, isHost: this.isHost });

      // Check if partner is already in the room
      const participants = this.call.participants();
      const remoteParticipants = Object.values(participants).filter(
        (p) => !p.local,
      );
      if (remoteParticipants.length > 0) {
        this.handleParticipantJoined(remoteParticipants[0]);
      } else {
        if (isHost) this.setStatus("waiting", "Waiting for partner...");
        // Re-poll for the partner instead of trusting one event (both roles).
        this.startWaitWatchdog();
      }

      return true;
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Connection failed";
      console.error("[Daily] Init error:", err);
      diag("daily-join-failed", { room: this.roomId, reason: errorMessage.slice(0, 80), isHost: this.isHost });
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
      // Enforce the 1:1 cap ONLY once we're already connected to a partner —
      // then a genuine 3rd person opening the link is rejected. BEFORE we
      // connect, remotes.length>1 is almost always a stale/ghost participant
      // lingering from a prior attempt alongside the REAL arrival; ignoring it
      // would strand us in 'waiting' forever, so bind the newcomer.
      if (this._status === "connected") {
        const remotes = Object.values(this.call?.participants() ?? {}).filter(
          (p) => !p.local,
        );
        if (remotes.length > 1) {
          console.warn("[Daily] Room already full — ignoring extra participant");
          return;
        }
      }
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
    // The meeting ended underneath us (typical after an iOS interruption
    // suspends the WebView long enough for the SFU connection to die). Surface
    // "reconnecting" so the page shows recovery UI; the visibility-resume
    // watcher performs the actual rejoin.
    this.call.on("left-meeting", () => {
      if (this.isDestroyed) return;
      console.warn("[Daily] left-meeting — connection died (interruption?)");
      diag("daily-left-meeting", { room: this.roomId, hadPartner: !!this.remoteStream });
      this.setStatus("reconnecting", "Reconnecting…");
    });

    this.call.on("error", (event) => {
      console.error("[Daily] Error:", event);
      if (!this.isDestroyed) {
        this.callbacks.onError?.(event?.errorMsg || "Connection error");
      }
    });

    // Network quality changes — correct mapping (very-low → poor, so the
    // "unstable" banner actually fires) + pull real RTT/loss from Daily.
    this.call.on("network-quality-change", () => {
      if (this.isDestroyed) return;
      void this.pollStats();
    });

    // Real network reconnection: Daily silently reconnects on a flaky network.
    // Surface it so the call page shows "Reconnecting…" instead of a frozen
    // video with zero feedback (the reported mobile-drop symptom).
    this.call.on("network-connection", (event) => {
      if (this.isDestroyed || !event) return;
      const state = (event as { event?: string }).event; // interrupted|connecting|connected
      if (state === "interrupted" || state === "connecting") {
        if (this._status === "connected") {
          this.setStatus("reconnecting", "Reconnecting…");
        }
      } else if (state === "connected") {
        if (this._status === "reconnecting") {
          this.setStatus("connected", "Reconnected");
        }
      }
    });

    // Nonfatal error — connection recovered
    this.call.on("nonfatal-error", (event) => {
      console.warn("[Daily] Nonfatal:", event);
    });
  }

  // Feed REAL RTT / packet-loss / quality from Daily's getNetworkStats into the
  // quality meter (the old code hardcoded rtt=0 and mapped worst→"good").
  private async pollStats(): Promise<void> {
    if (this.isDestroyed || !this.call) return;
    try {
      const ns = (await this.call.getNetworkStats()) as {
        threshold?: string;
        stats?: {
          latest?: {
            networkRoundTripTime?: number;
            totalRecvPacketLoss?: number;
            totalSendPacketLoss?: number;
            videoRecvBitsPerSecond?: number;
          };
        };
      };
      const latest = ns?.stats?.latest ?? {};
      const threshold = ns?.threshold;
      const quality: ConnectionQuality["quality"] =
        threshold === "good"
          ? "excellent"
          : threshold === "low"
            ? "fair"
            : threshold === "very-low"
              ? "poor"
              : "good";
      const rtt = Math.round((latest.networkRoundTripTime ?? 0) * 1000);
      const packetLoss = Math.round(
        Math.max(
          latest.totalRecvPacketLoss ?? 0,
          latest.totalSendPacketLoss ?? 0,
        ) * 100,
      );
      this.callbacks.onQualityUpdate?.({
        quality,
        packetLoss,
        rtt,
        jitter: 0,
        bandwidth: latest.videoRecvBitsPerSecond ?? 0,
        timestamp: Date.now(),
      });
    } catch {
      /* stats unavailable — leave the meter as-is */
    }
  }

  // ── Waiting watchdog ─────────────────────────────────────────────────────
  // While we have no remote participant, re-poll every 3s instead of relying on
  // a single 'participant-joined' event (which a suspended native WKWebView or a
  // dead SFU socket can drop). Two jobs: (1) notice a partner we missed by
  // re-scanning participants(); (2) notice a silently-dead SFU and rejoin.
  private startWaitWatchdog(): void {
    this.stopWaitWatchdog();
    this.waitStartedAt = Date.now();
    this.waitBeaconed = false;
    this.waitWatchdog = setInterval(() => {
      if (this.isDestroyed || !this.call) {
        this.stopWaitWatchdog();
        return;
      }
      if (this._status === "connected") {
        this.stopWaitWatchdog();
        return;
      }
      const state = this.getMeetingState();
      // SFU died silently (no 'left-meeting' processed on a frozen WebView) →
      // full rejoin, which re-scans participants on the way back in.
      if (state !== "joined-meeting" && state !== "joining-meeting") {
        this.stopWaitWatchdog();
        void this.recover();
        return;
      }
      // Alive but maybe we missed the join event — re-scan for a remote.
      const remotes = Object.values(this.call.participants() ?? {}).filter(
        (p) => !p.local,
      );
      if (remotes.length > 0) {
        this.handleParticipantJoined(remotes[0]);
        return;
      }
      // Still alone after ~25s — beacon once so a genuine no-show is visible in
      // telemetry and distinguishable from a connect bug.
      if (!this.waitBeaconed && Date.now() - this.waitStartedAt > 25000) {
        this.waitBeaconed = true;
        diag("waiting-no-partner", { room: this.roomId, isHost: this.isHost });
      }
    }, 3000);
  }

  private stopWaitWatchdog(): void {
    if (this.waitWatchdog) {
      clearInterval(this.waitWatchdog);
      this.waitWatchdog = null;
    }
  }

  // Public: re-scan for a remote participant we may have MISSED (e.g. a
  // 'participant-joined' dropped while a native WKWebView was suspended but the
  // SFU stayed alive). Idempotent — onPartnerJoined re-firing is harmless. The
  // call page invokes this on resume when the meeting survived (light path).
  resyncParticipants(): void {
    if (this.isDestroyed || !this.call || this._status === "connected") return;
    try {
      const remotes = Object.values(this.call.participants() ?? {}).filter(
        (p) => !p.local,
      );
      if (remotes.length > 0) this.handleParticipantJoined(remotes[0]);
    } catch {
      /* ignore */
    }
  }

  private handleParticipantJoined(participant: DailyParticipant): void {
    this.stopWaitWatchdog(); // partner found — stop re-polling
    const name = participant.user_name || "Partner";
    console.log("[Daily] Partner joined:", name);
    diag("daily-partner-seen", { room: this.roomId });
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

    // Poll real network stats every 3s for the quality meter.
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(() => void this.pollStats(), 3000);
    void this.pollStats();
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

  // Daily publishes its own tracks (audioSource: true) — muting the lobby
  // stream does NOT stop what the partner receives. These control the
  // actually-published tracks.
  setLocalAudio(enabled: boolean): void {
    if (this.isDestroyed || !this.call) return;
    this.call.setLocalAudio(enabled);
  }

  setLocalVideo(enabled: boolean): void {
    if (this.isDestroyed || !this.call) return;
    this.call.setLocalVideo(enabled);
  }

  // After an iOS interruption released the mic/camera, ask Daily to discard its
  // (possibly dead) internal tracks and acquire fresh ones — the safe, public
  // alternative to pushing external tracks via setInputDevicesAsync (which
  // silently switches Daily into custom-track mode). RESPECTS user intent:
  // callers pass the current mute/camera state so recovery never silently
  // unmutes a muted user or republishes a turned-off camera.
  refreshLocalMedia(audioOn = true, videoOn = true): void {
    if (this.isDestroyed || !this.call) return;
    try {
      if (audioOn) {
        this.call.setLocalAudio(true, { forceDiscardTrack: true });
      } else {
        this.call.setLocalAudio(false);
      }
      this.call.setLocalVideo(videoOn);
    } catch {
      /* ignore */
    }
  }

  // Current Daily meeting state — 'joined-meeting' means the SFU connection is
  // alive. After an iOS interruption (phone call / FaceTime seizes mic+camera
  // and suspends the WebView) it is typically 'left-meeting' or 'error'.
  getMeetingState(): string {
    if (this.isDestroyed || !this.call) return "none";
    try {
      return this.call.meetingState();
    } catch {
      return "none";
    }
  }

  // Recover from an iOS interruption: if the meeting survived, do nothing
  // (light path — the page just re-kicks media playback). If the meeting died,
  // tear down the dead call object and fully re-join the SAME room — the room
  // outlives us (1h TTL) and /api/daily/room get-or-creates + re-mints a fresh
  // token, so this is safe to call any number of times.
  async recover(): Promise<boolean> {
    if (this.isDestroyed) return false;

    if (this.getMeetingState() === "joined-meeting") return true;

    console.log("[Daily] Recovering after interruption — rejoining room");
    this.setStatus("reconnecting", "Reconnecting…");

    // Quietly discard the dead call object (do NOT use disconnect() — that
    // marks the instance destroyed and mutes callbacks).
    this.stopKeepAlive();
    this.stopWaitWatchdog();
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
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
    this.remoteStream = null;
    this.helloAcknowledged = false;

    // Full re-join with the same identity/room. connect() re-fetches the room
    // (get-or-create) + a fresh meeting token and rebuilds all listeners.
    const ok = await this.connect(this.roomId, this.isHost, this.userName, "video", undefined, {
      deviceId: this.deviceId,
      lang: this.lang,
    });
    diag("daily-recover", { room: this.roomId, result: ok ? "rejoined" : "failed" });
    return ok;
  }

  disconnect(): void {
    console.log("[Daily] Disconnecting...");
    this.isDestroyed = true;
    this.stopKeepAlive();
    this.stopWaitWatchdog();
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
