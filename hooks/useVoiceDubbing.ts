"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DubbingPhase =
  | "idle" // feature off (default)
  | "sampling" // collecting voice audio for fingerprint
  | "cloning" // POST to ElevenLabs to create voice clone
  | "ready" // voice clone ready, dubbing active
  | "error"; // unexpected failure

export interface VoiceDubbingState {
  phase: DubbingPhase;
  voiceId: string | null;
  samplingProgress: number; // 0-100%
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
  isDubPlaying: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_DURATION_MS = 15000; // 15s target for quality clone
const SILENCE_EXTEND_MS = 10000; // Extend up to 10s extra if silence detected
const MAX_SAMPLE_MS = 25000; // Absolute max sampling time
const MIN_SPEECH_CHUNKS = 10; // Need at least 10 data chunks with audio (5s of speech)
const MIN_TEXT_LENGTH = 3;
const MAX_TEXT_LENGTH = 500; // Multilingual model handles longer text
const DUB_GAIN = 2.5; // Loud dub volume (partner video is muted while playing)

// Default ElevenLabs voices by language (fallback when clone fails)
const DEFAULT_VOICES: Record<string, string> = {
  en: "21m00Tcm4TlvDq8ikWAM", // Rachel
  es: "AZnzlk1XvdvUeBnXmlld", // Domi
  fr: "MF3mGyEYCl7XYWbV9V6O", // Elli
  de: "TxGEqnHWrfWFTfGW9XjX", // Josh
  it: "VR6AewLTigWG4xSOukaG", // Arnold
  pt: "pNInz6obpgDQGcFmaJgB", // Adam
  ja: "ThT5KcBeYPX3keUQqHPh", // Dorothy
  ko: "AZnzlk1XvdvUeBnXmlld", // Domi
  zh: "ThT5KcBeYPX3keUQqHPh", // Dorothy
  ar: "21m00Tcm4TlvDq8ikWAM", // Rachel
  ru: "pNInz6obpgDQGcFmaJgB", // Adam
  hi: "21m00Tcm4TlvDq8ikWAM", // Rachel
  lt: "MF3mGyEYCl7XYWbV9V6O", // Elli (multilingual)
};

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
  const speechChunkCountRef = useRef(0); // Count chunks with actual audio data
  const samplingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const samplingStartRef = useRef<number>(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const voiceIdRef = useRef<string | null>(null);
  const targetLangRef = useRef(targetLang);
  const sessionKeyRef = useRef(`session-${Date.now()}`);
  const enabledRef = useRef(false);
  const processingRef = useRef(false);
  const remoteStreamRef = useRef<MediaStream | null>(remoteStream);
  const queueRef = useRef<Array<{text: string; sourceLang: string; targetLang: string}>>([]);

  // Keep remoteStream ref in sync (arrives later than hook mount)
  useEffect(() => {
    remoteStreamRef.current = remoteStream;
  }, [remoteStream]);

  // Keep targetLang ref in sync
  useEffect(() => {
    targetLangRef.current = targetLang;
  }, [targetLang]);

  // ─── Audio playback ──────────────────────────────────────────────────────

  const playAudioBase64 = useCallback(async (base64: string) => {
    // Fallback: create AudioContext here only if enable() didn't create one
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") await ctx.resume();

    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      } catch {
        // decodeAudioData failed (common on iOS) — fall back to <audio> element
        console.warn("[VoiceDub] decodeAudioData failed, falling back to <audio> element");
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = Math.min(DUB_GAIN / 3, 1); // Normalize for HTML audio (0-1 range)

        setState((s) => ({ ...s, isPlaying: true }));
        isPlayingRef.current = true;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          isPlayingRef.current = false;
          setState((s) => ({ ...s, isPlaying: false }));
          if (audioQueueRef.current.length > 0) {
            const next = audioQueueRef.current.shift()!;
            playAudioBase64(next);
          }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          isPlayingRef.current = false;
          setState((s) => ({ ...s, isPlaying: false }));
        };
        await audio.play().catch(() => {
          URL.revokeObjectURL(url);
          isPlayingRef.current = false;
          setState((s) => ({ ...s, isPlaying: false }));
        });
        return;
      }

      const source = ctx.createBufferSource();

      if (!gainNodeRef.current) {
        gainNodeRef.current = ctx.createGain();
        gainNodeRef.current.gain.value = DUB_GAIN;
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

  // ─── Voice sampling with silence detection ─────────────────────────────

  const stopSamplingAndClone = useCallback(
    async (mimeType: string) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (samplingTimerRef.current) clearTimeout(samplingTimerRef.current);

      // Give recorder 300ms to flush final data
      await new Promise((r) => setTimeout(r, 300));

      const chunks = audioChunksRef.current;
      if (chunks.length === 0) {
        console.warn("[VoiceDub] No audio chunks collected, using default voice");
        const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
        voiceIdRef.current = defaultVoice;
        setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice, samplingProgress: 100 }));
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
          console.warn("[VoiceDub] Clone failed, using default voice");
          const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
          voiceIdRef.current = defaultVoice;
          setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice }));
          return;
        }

        voiceIdRef.current = data.voiceId;
        setState((s) => ({ ...s, phase: "ready", voiceId: data.voiceId }));
        console.log("[VoiceDub] Voice clone created:", data.voiceId);
      } catch (e) {
        console.warn("[VoiceDub] Clone network error, using default voice:", e);
        const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
        voiceIdRef.current = defaultVoice;
        setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice }));
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
        console.warn("[VoiceDub] MediaRecorder not supported");
        const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
        voiceIdRef.current = defaultVoice;
        setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice, samplingProgress: 100 }));
        return;
      }

      audioChunksRef.current = [];
      speechChunkCountRef.current = 0;
      samplingStartRef.current = Date.now();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      try {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.warn("[VoiceDub] No audio tracks in remote stream");
          const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
          voiceIdRef.current = defaultVoice;
          setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice, samplingProgress: 100 }));
          return;
        }

        const audioStream = new MediaStream(audioTracks);
        const recorder = new MediaRecorder(audioStream, {
          mimeType,
          audioBitsPerSecond: 192000, // Higher bitrate for better clone quality
        });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
            // Track chunks with meaningful audio (>500 bytes suggests speech, not silence)
            if (e.data.size > 500) {
              speechChunkCountRef.current++;
            }
          }
        };

        recorder.start(500); // Collect data every 500ms

        setState((s) => ({ ...s, phase: "sampling", samplingProgress: 0 }));

        // Progress indicator
        progressTimerRef.current = setInterval(() => {
          const elapsed = Date.now() - samplingStartRef.current;
          const progress = Math.min(100, Math.round((elapsed / SAMPLE_DURATION_MS) * 100));
          setState((s) => ({ ...s, samplingProgress: progress }));
        }, 200);

        // Smart stop: after SAMPLE_DURATION_MS, check if we have enough speech
        const checkAndStop = () => {
          const elapsed = Date.now() - samplingStartRef.current;
          const hasEnoughSpeech = speechChunkCountRef.current >= MIN_SPEECH_CHUNKS;

          if (hasEnoughSpeech || elapsed >= MAX_SAMPLE_MS) {
            // Good to go — clone with what we have
            stopSamplingAndClone(mimeType);
          } else if (elapsed < MAX_SAMPLE_MS) {
            // Not enough speech yet — extend sampling
            console.log(`[VoiceDub] Only ${speechChunkCountRef.current} speech chunks, extending...`);
            samplingTimerRef.current = setTimeout(checkAndStop, SILENCE_EXTEND_MS);
          }
        };

        samplingTimerRef.current = setTimeout(checkAndStop, SAMPLE_DURATION_MS);
      } catch (e) {
        console.warn("[VoiceDub] MediaRecorder setup failed:", e);
        const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
        voiceIdRef.current = defaultVoice;
        setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice, samplingProgress: 100 }));
      }
    },
    [stopSamplingAndClone],
  );

  // ─── Process incoming transcript ─────────────────────────────────────────

  const processTranscript = useCallback(
    async (text: string, sourceLang: string, targetLang: string) => {
      if (!enabledRef.current) return;
      if (!voiceIdRef.current) return;
      if (!text?.trim() || text.length < MIN_TEXT_LENGTH) return;
      if (text.length > MAX_TEXT_LENGTH) return;

      // If already processing, queue the transcript instead of dropping it
      if (processingRef.current) {
        if (queueRef.current.length < 10) {
          queueRef.current.push({ text, sourceLang, targetLang });
        }
        return;
      }

      processingRef.current = true;

      try {
        const res = await fetch("/api/voice-dub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            voiceId: voiceIdRef.current,
            targetLang: targetLang || targetLangRef.current,
            skipTranslation: true,
          }),
        });

        const data = await res.json();

        if (data.translatedText) {
          setState((s) => ({ ...s, lastTranslation: data.translatedText }));
        }

        if (data.audioBase64 && !data.fallback) {
          if (isPlayingRef.current) {
            if (audioQueueRef.current.length < 5) {
              audioQueueRef.current.push(data.audioBase64);
            }
          } else {
            playAudioBase64(data.audioBase64);
          }
        }
      } catch (e) {
        console.warn("[VoiceDub] Dub request failed:", e);
      } finally {
        processingRef.current = false;

        // Process next queued transcript if any
        const next = queueRef.current.shift();
        if (next) {
          processTranscript(next.text, next.sourceLang, next.targetLang);
        }
      }
    },
    [playAudioBase64],
  );

  // ─── Enable / Disable ────────────────────────────────────────────────────

  const enable = useCallback(() => {
    enabledRef.current = true;
    setState((s) => ({ ...s, isEnabled: true }));

    // Create AudioContext NOW — inside user gesture (button click) so iOS won't block it
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
    }
    audioContextRef.current.resume();

    // Use ref instead of stale closure prop — remoteStream may arrive after hook mounts
    const stream = remoteStreamRef.current;
    if (stream && stream.getAudioTracks().length) {
      startSampling(stream);
    } else {
      // No remote audio yet — use default voice immediately
      console.log("[VoiceDub] No remote stream, using default voice");
      const defaultVoice = DEFAULT_VOICES[targetLangRef.current.split("-")[0]] || DEFAULT_VOICES.en;
      voiceIdRef.current = defaultVoice;
      setState((s) => ({ ...s, phase: "ready", voiceId: defaultVoice, samplingProgress: 100 }));
    }
  }, [startSampling]);

  const disable = useCallback(() => {
    enabledRef.current = false;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }

    if (samplingTimerRef.current) clearTimeout(samplingTimerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    audioQueueRef.current = [];
    queueRef.current = [];

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

    // Delete voice clone from ElevenLabs (don't delete default voices)
    const isDefaultVoice = Object.values(DEFAULT_VOICES).includes(voiceIdRef.current || "");
    if (voiceIdRef.current && !isDefaultVoice) {
      fetch("/api/voice-clone", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: voiceIdRef.current }),
      }).catch(() => {});
    }

    try { audioContextRef.current?.close(); } catch { /* ignore */ }
    audioContextRef.current = null;
    gainNodeRef.current = null;
    voiceIdRef.current = null;
    processingRef.current = false;
  }, [disable]);

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, enable, disable, processTranscript, cleanup, isDubPlaying: state.isPlaying };
}
