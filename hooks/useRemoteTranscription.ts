/**
 * useRemoteTranscription.ts — FALLBACK TRANSCRIPTION FOR REMOTE AUDIO
 *
 * Captures audio from the remote WebRTC stream and transcribes it via
 * Whisper when the partner's own transcription pipeline fails to send
 * data messages. Activates automatically after a silence timeout.
 *
 * This is a FALLBACK — it only activates when we haven't received any
 * transcription/translation messages from the partner in FALLBACK_TIMEOUT_MS.
 * When the partner's pipeline is working, this stays dormant.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

  // Keep language refs fresh
  useEffect(() => {
    partnerLangRef.current = partnerLang;
    myLangRef.current = myLang;
  }, [partnerLang, myLang]);

  // ── Signal that partner sent a message (resets fallback timer) ──────────
  const onPartnerMessage = useCallback(() => {
    lastPartnerMessageRef.current = Date.now();
    // If fallback was active, deactivate it — partner is talking fine
    if (isFallbackActive) {
      setIsFallbackActive(false);
      stopRecording();
    }
  }, [isFallbackActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recording control ──────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mrRef.current && mrRef.current.state !== "inactive") {
      try { mrRef.current.stop(); } catch { /* already stopped */ }
    }
    mrRef.current = null;
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!remoteStream) return;
    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) return;

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

      const chunks: Blob[] = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mr.onstop = async () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        chunks.length = 0;

        if (blob.size < MIN_BLOB_SIZE) {
          // Restart if still running
          if (isRunningRef.current && mrRef.current) {
            try { mrRef.current.start(CHUNK_MS); } catch { /* stream ended */ }
          }
          return;
        }

        // Transcribe via Whisper
        try {
          const form = new FormData();
          form.append("audio", blob, "remote.webm");
          form.append("language", partnerLangRef.current);

          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          if (!res.ok) return;

          const data = await res.json();
          const text = (data.text ?? "").trim();

          if (text && text.length > 1) {
            setRemoteText(text);

            // Translate to user's language
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
                if (tRes.ok) {
                  const tData = await tRes.json();
                  const translation = tData.translation || tData.translated || text;
                  setRemoteTranslation(translation);
                }
              } catch {
                setRemoteTranslation(text);
              }
            } else {
              setRemoteTranslation(text);
            }
          }
        } catch {
          // Whisper failed — silent, will retry next chunk
        }

        // Restart recording if still active
        if (isRunningRef.current && mrRef.current && mrRef.current.state === "inactive") {
          try { mrRef.current.start(CHUNK_MS); } catch { /* stream ended */ }
        }
      };

      mr.start(CHUNK_MS);
      console.log("[RemoteSTT] Fallback transcription activated");
    } catch (e) {
      console.warn("[RemoteSTT] Failed to start MediaRecorder:", e);
    }
  }, [remoteStream]);

  // ── Fallback activation check ──────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !remoteStream) {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      stopRecording();
      setIsFallbackActive(false);
      isRunningRef.current = false;
      return;
    }

    // Check every 3s if partner has gone silent
    fallbackTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastPartnerMessageRef.current;
      if (elapsed >= FALLBACK_TIMEOUT_MS && !isFallbackActive) {
        console.log("[RemoteSTT] No partner messages for", Math.round(elapsed / 1000), "s — activating fallback");
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
  }, [isActive, remoteStream, isFallbackActive, startRecording, stopRecording]);

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
