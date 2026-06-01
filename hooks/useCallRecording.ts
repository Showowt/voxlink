"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// CALL RECORDING HOOK — Records the remote stream (what you hear/see)
// Uses MediaRecorder API with webm/vp9+opus codec
// ═══════════════════════════════════════════════════════════════════════════════

export interface UseCallRecordingReturn {
  isRecording: boolean;
  recordingDuration: number; // seconds
  startRecording: (remoteStream: MediaStream) => void;
  stopRecording: () => Promise<Blob | null>;
  downloadRecording: () => void;
  recordingBlob: Blob | null;
}

// Prefer vp9+opus, fallback to vp8+opus, then whatever is available
function getSupportedMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "video/webm";
}

export function useCallRecording(): UseCallRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore stop errors on unmount
        }
      }
    };
  }, []);

  const startRecording = useCallback((remoteStream: MediaStream) => {
    if (typeof MediaRecorder === "undefined") {
      console.error("[Recording] MediaRecorder not supported");
      return;
    }

    // Don't start if already recording
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      return;
    }

    // Reset state
    chunksRef.current = [];
    setRecordingBlob(null);
    setRecordingDuration(0);

    const mimeType = getSupportedMimeType();

    try {
      const recorder = new MediaRecorder(remoteStream, {
        mimeType,
        videoBitsPerSecond: 1_000_000, // 1 Mbps — decent quality, reasonable file size
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordingBlob(blob);
        setIsRecording(false);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Resolve the stop promise if pending
        if (resolveStopRef.current) {
          resolveStopRef.current(blob);
          resolveStopRef.current = null;
        }
      };

      recorder.onerror = (event) => {
        console.error("[Recording] MediaRecorder error:", event);
        setIsRecording(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (resolveStopRef.current) {
          resolveStopRef.current(null);
          resolveStopRef.current = null;
        }
      };

      // Collect data every second for robustness
      recorder.start(1000);
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);

      // Duration timer
      intervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("[Recording] Failed to start MediaRecorder:", err);
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === "inactive") {
        resolve(recordingBlob);
        return;
      }

      resolveStopRef.current = resolve;

      try {
        recorderRef.current.stop();
      } catch {
        resolve(null);
      }
    });
  }, [recordingBlob]);

  const downloadRecording = useCallback(() => {
    const blob = recordingBlob;
    if (!blob) return;

    const datePart = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entrevoz-call-${datePart}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordingBlob]);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    downloadRecording,
    recordingBlob,
  };
}
