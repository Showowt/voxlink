"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DubbingPhase =
  | "idle" // feature off (default)
  | "sampling" // collecting first 15s of audio for voice fingerprint
  | "cloning" // POST to ElevenLabs to create voice clone
  | "ready" // voice clone ready, dubbing active
  | "unavailable" // ElevenLabs not configured or clone failed — subtitle fallback
  | "error"; // unexpected failure

export interface VoiceDubbingState {
  phase: DubbingPhase;
  voiceId: string | null;
  samplingProgress: number; // 0-100% (0-15 seconds)
  isPlaying: boolean;
  isEnabled: boolean;
  lastTranslation: string;
}

export interface UseVoiceDubbingReturn {
  state: VoiceDubbingState;
  enable: () => void;
  disable: () => void;
  processTranscript: (
    text: string,
    sourceLang: string,
    targetLang: string,
  ) => void;
  cleanup: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_DURATION_MS = 15000; // 15s of audio for voice clone
const MIN_TEXT_LENGTH = 4; // Don't dub single words
const MAX_TEXT_LENGTH = 300; // ElevenLabs limit for flash model
const AUDIO_GAIN = 0.85; // Slight reduction to prevent clipping

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceDubbing(
  remoteStream: MediaStream | null,
  targetLang: string,
): UseVoiceDubbingReturn {
  const [state, setState] = useState<VoiceDubbingState>({
    phase: "idle",
    voiceId: null,
    samplingProgress: 0,
    isPlaying: false,
    isEnabled: false,
    lastTranslation: "",
  });

  // Refs — no re-renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const samplingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const samplingStartRef = useRef<number>(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<string[]>([]); // base64 audio queue
  const isPlayingRef = useRef(false);
  const voiceIdRef = useRef<string | null>(null);
  const targetLangRef = useRef(targetLang);
  const sessionKeyRef = useRef(`session-${Date.now()}`);
  const enabledRef = useRef(false);
  const processingRef = useRef(false); // Prevent concurrent dub requests

  // Keep targetLang ref in sync
  useEffect(() => {
    targetLangRef.current = targetLang;
  }, [targetLang]);

  // ─── Audio playback ──────────────────────────────────────────────────────

  const playAudioBase64 = useCallback(async (base64: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") await ctx.resume();

    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();

      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.gain.value = AUDIO_GAIN;
        gainNodeRef.current.connect(ctx.destination);
      }

      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current);

      setState((s) => ({ ...s, isPlaying: true }));
      isPlayingRef.current = true;

      source.start();
      source.onended = () => {
        isPlayingRef.current = false;
        setState((s) => ({ ...s, isPlaying: false }));
        // Play next in queue
        if (audioQueueRef.current.length > 0) {
          const next = audioQueueRef.current.shift()!;
          playAudioBase64(next);
        }
      };
    } catch (e) {
      console.warn("[VoiceDub] Audio decode error:", e);
      isPlayingRef.current = false;
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  // ─── Voice sampling ──────────────────────────────────────────────────────

  const stopSamplingAndClone = useCallback(
    async (mimeType: string) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);

      // Give recorder 200ms to flush final data
      await new Promise((r) => setTimeout(r, 200));

      const chunks = audioChunksRef.current;
      if (chunks.length === 0) {
        console.warn("[VoiceDub] No audio chunks collected");
        setState((s) => ({ ...s, phase: "unavailable" }));
        return;
      }

      setState((s) => ({ ...s, phase: "cloning", samplingProgress: 100 }));

      const audioBlob = new Blob(chunks, { type: mimeType });

      // Convert to base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(audioBlob);
      });

      // POST to voice clone API
      try {
        const res = await fetch("/api/voice-clone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType,
            sessionKey: sessionKeyRef.current,
          }),
        });

        const data = await res.json();

        if (!res.ok || data.fallback) {
          console.warn("[VoiceDub] Clone failed, falling back to subtitles");
          setState((s) => ({ ...s, phase: "unavailable" }));
          return;
        }

        voiceIdRef.current = data.voiceId;
        setState((s) => ({ ...s, phase: "ready", voiceId: data.voiceId }));
      } catch (e) {
        console.warn("[VoiceDub] Clone network error:", e);
        setState((s) => ({ ...s, phase: "unavailable" }));
      }
    },
    [],
  );

  const startSampling = useCallback(
    (stream: MediaStream) => {
      if (
        !MediaRecorder.isTypeSupported("audio/webm;codecs=opus") &&
        !MediaRecorder.isTypeSupported("audio/webm") &&
        !MediaRecorder.isTypeSupported("audio/mp4")
      ) {
        console.warn(
          "[VoiceDub] MediaRecorder not supported, falling back to subtitles",
        );
        setState((s) => ({ ...s, phase: "unavailable" }));
        return;
      }

      audioChunksRef.current = [];
      samplingStartRef.current = Date.now();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      try {
        // Only record audio track from remote stream
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.warn("[VoiceDub] No audio tracks in remote stream");
          setState((s) => ({ ...s, phase: "unavailable" }));
          return;
        }
        const audioStream = new MediaStream(audioTracks);
        const recorder = new MediaRecorder(audioStream, {
          mimeType,
          audioBitsPerSecond: 128000,
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.start(500); // Collect data every 500ms

        setState((s) => ({ ...s, phase: "sampling", samplingProgress: 0 }));

        // Progress indicator
        progressTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - samplingStartRef.current;
          const progress = Math.min(
            100,
            Math.round((elapsed / SAMPLE_DURATION_MS) * 100),
          );
          setState((s) => ({ ...s, samplingProgress: progress }));
        }, 300);

        // Stop sampling after SAMPLE_DURATION_MS
        samplingTimerRef.current = setTimeout(() => {
          stopSamplingAndClone(mimeType);
        }, SAMPLE_DURATION_MS);
      } catch (e) {
        console.warn("[VoiceDub] MediaRecorder setup failed:", e);
        setState((s) => ({ ...s, phase: "unavailable" }));
      }
    },
    [stopSamplingAndClone],
  );

  // ─── Process incoming transcript ─────────────────────────────────────────

  const processTranscript = useCallback(
    async (text: string, sourceLang: string, targetLang: string) => {
      // Only process when ready and enabled
      if (!enabledRef.current) return;
      if (!voiceIdRef.current) return;
      if (!text?.trim() || text.length < MIN_TEXT_LENGTH) return;
      if (text.length > MAX_TEXT_LENGTH) return;
      if (processingRef.current) {
        // Don't pile up requests — drop if currently processing
        return;
      }

      // Don't dub if same language (no translation needed)
      const srcBase = sourceLang.split("-")[0].toLowerCase();
      const tgtBase = targetLang.split("-")[0].toLowerCase();
      if (srcBase === tgtBase) return;

      processingRef.current = true;

      try {
        const res = await fetch("/api/voice-dub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            voiceId: voiceIdRef.current,
            targetLang: targetLangRef.current,
          }),
        });

        const data = await res.json();

        if (data.translatedText) {
          setState((s) => ({ ...s, lastTranslation: data.translatedText }));
        }

        if (data.audioBase64 && !data.fallback) {
          // Queue audio (don't interrupt currently playing)
          if (isPlayingRef.current) {
            // Only queue if queue is short (drop older pending audio)
            if (audioQueueRef.current.length < 2) {
              audioQueueRef.current.push(data.audioBase64);
            }
          } else {
            playAudioBase64(data.audioBase64);
          }
        }
        // If fallback=true: translatedText is still set → caller updates subtitle
      } catch (e) {
        console.warn("[VoiceDub] Dub request failed:", e);
      } finally {
        processingRef.current = false;
      }
    },
    [playAudioBase64],
  );

  // ─── Enable / Disable ────────────────────────────────────────────────────

  const enable = useCallback(() => {
    if (!remoteStream || !remoteStream.getAudioTracks().length) {
      console.warn("[VoiceDub] No remote audio stream");
      return;
    }
    enabledRef.current = true;
    setState((s) => ({ ...s, isEnabled: true }));
    startSampling(remoteStream);
  }, [remoteStream, startSampling]);

  const disable = useCallback(() => {
    enabledRef.current = false;

    // Stop recorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }

    // Clear timers
    if (samplingTimerRef.current) clearTimeout(samplingTimerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    // Clear audio queue
    audioQueueRef.current = [];

    setState((s) => ({
      ...s,
      phase: "idle",
      isEnabled: false,
      isPlaying: false,
      samplingProgress: 0,
    }));
  }, []);

  // ─── Cleanup on unmount ──────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    disable();

    // Delete voice clone from ElevenLabs (don't accumulate clones)
    if (voiceIdRef.current) {
      fetch("/api/voice-clone", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voiceIdRef.current }),
      }).catch(() => {});
    }

    // Close audio context
    try {
      audioContextRef.current?.close();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;
    gainNodeRef.current = null;
    voiceIdRef.current = null;
    processingRef.current = false;
  }, [disable]);

  // Auto-cleanup on unmount
  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, enable, disable, processTranscript, cleanup };
}
