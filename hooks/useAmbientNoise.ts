/**
 * useAmbientNoise.ts — Real-time ambient noise detection via AudioContext
 *
 * Classifies the environment so VoxLink can auto-suggest the right mode:
 *   < 35dB  → QUIET    (library, bedroom — EarMode perfect)
 *   35-55dB → MODERATE (office, cafe — EarMode works)
 *   55-72dB → LOUD     (bar, restaurant — increase volume)
 *   > 72dB  → CONCERT  (club, gig — switch to TextMode)
 *
 * @version 1.0.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type NoiseLevel = "quiet" | "moderate" | "loud" | "concert";

export interface NoiseReading {
  db: number; // 0-100 (normalized from raw analyzer data)
  level: NoiseLevel;
  bars: number; // 0-5 for display
  label: string;
  autoTextMode: boolean; // true when too loud for STT
}

export interface UseAmbientNoiseOptions {
  enabled?: boolean;
  updateIntervalMs?: number; // how often to sample, default 200ms
}

export interface UseAmbientNoiseReturn {
  reading: NoiseReading;
  isActive: boolean;
  permissionDenied: boolean;
  start: () => Promise<void>;
  stop: () => void;
  // Raw waveform data for visualizer (128 values 0-255)
  waveform: Uint8Array<ArrayBuffer>;
}

function classify(db: number): Omit<NoiseReading, "db"> {
  if (db < 35)
    return { level: "quiet", bars: 1, label: "Quiet", autoTextMode: false };
  if (db < 55)
    return {
      level: "moderate",
      bars: 2,
      label: "Moderate",
      autoTextMode: false,
    };
  if (db < 72)
    return { level: "loud", bars: 4, label: "Loud", autoTextMode: false };
  return { level: "concert", bars: 5, label: "Concert", autoTextMode: true };
}

export function useAmbientNoise({
  enabled = true,
  updateIntervalMs = 200,
}: UseAmbientNoiseOptions = {}): UseAmbientNoiseReturn {
  const [reading, setReading] = useState<NoiseReading>({
    db: 0,
    level: "quiet",
    bars: 0,
    label: "—",
    autoTextMode: false,
  });
  const [isActive, setIsActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [waveform, setWaveform] = useState<Uint8Array<ArrayBuffer>>(
    new Uint8Array(128),
  );

  const ctxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(128));

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current)
      streamRef.current.getTracks().forEach((t) => t.stop());
    if (ctxRef.current) ctxRef.current.close().catch(() => {});
    analyzerRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
    setIsActive(false);
    setReading({
      db: 0,
      level: "quiet",
      bars: 0,
      label: "—",
      autoTextMode: false,
    });
  }, []);

  const start = useCallback(async () => {
    if (!enabled || isActive || typeof window === "undefined") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256; // 128 data points
      analyzer.smoothingTimeConstant = 0.6; // smooth out spikes

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyzer);

      ctxRef.current = ctx;
      analyzerRef.current = analyzer;
      dataRef.current = new Uint8Array(
        analyzer.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;

      setIsActive(true);
      setPermissionDenied(false);

      // Sample on interval
      intervalRef.current = setInterval(() => {
        if (!analyzerRef.current) return;
        analyzerRef.current.getByteTimeDomainData(dataRef.current);

        // RMS amplitude → dB
        let sum = 0;
        for (let i = 0; i < dataRef.current.length; i++) {
          const v = (dataRef.current[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataRef.current.length);
        const db =
          rms > 0 ? Math.min(100, Math.max(0, 20 * Math.log10(rms) + 85)) : 0;

        const classification = classify(db);
        setReading({ db: Math.round(db), ...classification });
        setWaveform(new Uint8Array(dataRef.current) as Uint8Array<ArrayBuffer>);
      }, updateIntervalMs);
    } catch (e) {
      const err = e as Error;
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        setPermissionDenied(true);
      }
      console.warn("[AmbientNoise]", err.message);
    }
  }, [enabled, isActive, updateIntervalMs]);

  // Auto-cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { reading, isActive, permissionDenied, start, stop, waveform };
}

export default useAmbientNoise;
