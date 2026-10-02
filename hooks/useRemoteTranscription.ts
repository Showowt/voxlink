/**
 * useRemoteTranscription.ts — FALLBACK TRANSCRIPTION FOR REMOTE AUDIO
 *
 * Captures audio from the remote WebRTC stream and transcribes it via Whisper.
 * Intended as a LAST-RESORT fallback for when the partner's OWN transcription
 * pipeline is dead and sends no data messages at all.
 *
 * ⚠️ DISABLED BY DEFAULT (REMOTE_FALLBACK_ENABLED = false).
 *
 * Why: it could not tell "partner's pipeline crashed" from "partner is simply
 * quiet" — it armed after any 8s gap (and, because its timer started at page
 * mount, within ~3s of every connect). It then fed 2s clips of silence/noise to
 * Whisper with only a byte-size gate (which on iOS/AAC only catches a MUTED
 * partner), and showed whatever Whisper invented ("thank you for watching",
 * "this is sponsored by…") as the PARTNER's caption — and spoke it aloud. That
 * was the primary source of "random words popping up that nobody said".
 *
 * Both call participants already run their OWN sender-side STT with a Whisper
 * fallback (useTranscription), so this remote path is redundant on every real
 * device. It is kept behind a flag, hardened (generation-guarded, caption-
 * clearing, no auto-TTS, no source-text-as-translation) so that IF it is ever
 * re-enabled it cannot resurrect the phantom-text bug.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Master switch. Leave OFF — see the header. Flip to true only alongside a
// real voice-activity gate and the partner-STT-health heartbeat described in
// the audit; the raw silence-triggered version must never ship on again.
const REMOTE_FALLBACK_ENABLED = false;

// How long to wait without partner messages before activating fallback
const FALLBACK_TIMEOUT_MS = 8000;
// Whisper chunk duration (how often we send audio to transcribe)
const CHUNK_MS = 2000;
// Min blob size to bother sending (skip silence)
const MIN_BLOB_SIZE = 2048;

interface UseRemoteTranscriptionOptions {
  remoteStream: MediaStream | null;
  partnerLang: string;
  myLang: string;
  isActive: boolean;
}

interface UseRemoteTranscriptionReturn {
  remoteText: string;
  remoteTranslation: string;
  isFallbackActive: boolean;
  onPartnerMessage: () => void;
}

export function useRemoteTranscription({
  remoteStream,
  partnerLang,
  myLang,
  isActive,
}: UseRemoteTranscriptionOptions): UseRemoteTranscriptionReturn {
  const [remoteText, setRemoteText] = useState("");
  const [remoteTranslation, setRemoteTranslation] = useState("");
  const [isFallbackActive, setIsFallbackActive] = useState(false);

  const mrRef = useRef<MediaRecorder | null>(null);
  const isRunningRef = useRef(false);
  const partnerLangRef = useRef(partnerLang);
  const myLangRef = useRef(myLang);
  const lastPartnerMessageRef = useRef(Date.now());
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chunkTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Bumped on every stop/deactivate. A clip's async transcribe/translate only
  // applies its result if the generation still matches — so a clip that
  // finishes AFTER the partner starts talking (or after teardown) is discarded
  // instead of flashing a stale phantom onto the caption line.
  const genRef = useRef(0);

  // Keep language refs fresh
  useEffect(() => {
    partnerLangRef.current = partnerLang;
    myLangRef.current = myLang;
  }, [partnerLang, myLang]);

  // Clear any fallback caption currently on screen.
  const clearCaptions = useCallback(() => {
    setRemoteText("");
    setRemoteTranslation("");
  }, []);

  // ── Recording control ──────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    genRef.current++; // invalidate any in-flight clip result
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (mrRef.current && mrRef.current.state !== "inactive") {
      try { mrRef.current.stop(); } catch { /* already stopped */ }
    }
    mrRef.current = null;
    clearCaptions();
  }, [clearCaptions]);

  // ── Signal that partner sent a message (resets fallback timer) ──────────
  const onPartnerMessage = useCallback(() => {
    lastPartnerMessageRef.current = Date.now();
    // If fallback was active, deactivate it — partner is talking fine
    if (isFallbackActive) {
      setIsFallbackActive(false);
      stopRecording();
    }
  }, [isFallbackActive, stopRecording]);

  const startRecording = useCallback(() => {
    if (!remoteStream) return;
    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const myGen = genRef.current;

    // Create a stream with only audio tracks
    const audioStream = new MediaStream(audioTracks);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

    try {
      const mr = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
      mrRef.current = mr;

      let chunks: Blob[] = [];

      const scheduleStop = () => {
        chunkTimerRef.current = setTimeout(() => {
          if (mrRef.current && mrRef.current.state === "recording") {
            try { mrRef.current.stop(); } catch { /* already stopped */ }
          }
        }, CHUNK_MS);
      };

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mr.onstop = async () => {
        const localChunks = chunks;
        chunks = [];
        const blob = new Blob(localChunks, { type: mimeType || "audio/webm" });

        // Restart the cycle immediately (keep listening) before async work
        if (isRunningRef.current && genRef.current === myGen && mrRef.current?.state === "inactive") {
          try { mrRef.current.start(); scheduleStop(); } catch { /* stream ended */ }
        }

        if (blob.size < MIN_BLOB_SIZE) return;
        // Discard a clip whose generation has been invalidated (partner started
        // talking, or we tore down) — never show its result.
        if (genRef.current !== myGen) return;

        try {
          const form = new FormData();
          form.append("audio", blob, "remote.webm");
          form.append("language", partnerLangRef.current);

          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!res.ok) return;

          const data = await res.json();
          const text = (data.text ?? "").trim();

          // Respect server hallucination drop; ignore 1-char noise; and bail if
          // this clip is now stale.
          if (!text || data.dropped || text.length <= 1) return;
          if (genRef.current !== myGen) return;

          setRemoteText(text);

          if (partnerLangRef.current !== myLangRef.current) {
            try {
              const tRes = await fetch("/api/translate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text,
                  from: partnerLangRef.current,
                  to: myLangRef.current,
                }),
              });
              if (!tRes.ok) return;
              const tData = await tRes.json();
              // Drop the line when translation fails — showing the untranslated
              // source as if it were the translation is its own bug.
              if (tData.untranslated || !(tData.translation || tData.translated)) return;
              if (genRef.current !== myGen) return;
              setRemoteTranslation(tData.translation || tData.translated);
            } catch {
              /* translation failed — leave source-language caption only */
            }
          } else {
            setRemoteTranslation(text);
          }
        } catch {
          // Whisper failed — silent, will retry next chunk
        }
      };

      mr.start();
      scheduleStop();
      console.log("[RemoteSTT] Fallback transcription activated");
    } catch (e) {
      console.warn("[RemoteSTT] Failed to start MediaRecorder:", e);
    }
  }, [remoteStream]);

  // ── Fallback activation check ──────────────────────────────────────────
  useEffect(() => {
    if (!REMOTE_FALLBACK_ENABLED || !isActive || !remoteStream) {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      stopRecording();
      setIsFallbackActive(false);
      isRunningRef.current = false;
      return;
    }

    // Reset the silence timer on (re)connect so a stale lobby/mount timestamp
    // can't arm the fallback within seconds of connecting.
    lastPartnerMessageRef.current = Date.now();

    // Check every 3s if partner has gone silent
    fallbackTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastPartnerMessageRef.current;
      if (elapsed >= FALLBACK_TIMEOUT_MS && !isFallbackActive) {
        console.log("[RemoteSTT] No partner messages for", Math.round(elapsed / 1000), "s — activating fallback");
        clearCaptions();
        setIsFallbackActive(true);
        isRunningRef.current = true;
        startRecording();
      }
    }, 3000);

    return () => {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [isActive, remoteStream, isFallbackActive, startRecording, stopRecording, clearCaptions]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      stopRecording();
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
      }
    };
  }, [stopRecording]);

  return {
    remoteText,
    remoteTranslation,
    isFallbackActive,
    onPartnerMessage,
  };
}

export default useRemoteTranscription;
