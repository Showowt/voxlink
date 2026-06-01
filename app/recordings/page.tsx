"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  listRecordings,
  deleteRecording,
  downloadRecordingById,
  getRecordingBlob,
  type RecordingMeta,
} from "../lib/recording-storage";

// ═══════════════════════════════════════════════════════════════════════════════
// RECORDINGS PAGE — Browse, play, download, and delete saved call recordings
// Data: metadata in localStorage, blobs in IndexedDB
// ═══════════════════════════════════════════════════════════════════════════════

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RecordingsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecordings(listRecordings());
    setLoaded(true);
  }, []);

  const handlePlay = useCallback(async (id: string) => {
    try {
      const blob = await getRecordingBlob(id);
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      // Open in new tab for playback
      const w = window.open("", "_blank");
      if (w) {
        w.document.title = "Entrevoz Recording";
        w.document.body.style.cssText = "margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;";
        const video = w.document.createElement("video");
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        video.style.cssText = "max-width:100%;max-height:100vh;";
        w.document.body.appendChild(video);
      }
    } catch (err) {
      console.error("[Recordings] Playback failed:", err);
    }
  }, []);

  const handleDownload = useCallback(async (id: string) => {
    try {
      await downloadRecordingById(id);
    } catch (err) {
      console.error("[Recordings] Download failed:", err);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRecording(id);
      setRecordings(listRecordings());
    } catch (err) {
      console.error("[Recordings] Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }, []);

  if (!loaded) return null;

  return (
    <div className="min-h-[100dvh] bg-[#030507]">
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-4 flex items-center gap-3"
        style={{
          background: "rgba(3, 5, 7, 0.9)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/60 hover:text-white/90 hover:bg-white/5 transition-colors"
          aria-label="Go back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-white text-lg font-semibold">Recordings</h1>
          <p className="text-white/40 text-xs">
            {recordings.length} recording{recordings.length !== 1 ? "s" : ""} saved
          </p>
        </div>
      </div>

      {/* Empty state */}
      {recordings.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 pt-32 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.15)",
            }}
          >
            <svg className="w-7 h-7 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <h2 className="text-white/80 text-base font-medium mb-1">No recordings yet</h2>
          <p className="text-white/40 text-sm max-w-xs leading-relaxed">
            Tap the record button during a call to save a recording. Recordings are stored locally on this device.
          </p>
        </div>
      )}

      {/* Recording list */}
      <div className="px-4 py-4 space-y-3">
        {recordings.map((rec) => (
          <div
            key={rec.id}
            className="rounded-xl p-4 transition-all"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Top row: name + date */}
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-white/90 text-sm font-medium truncate">
                  {rec.partnerName || "Unknown"}
                </h3>
                <p className="text-white/40 text-xs mt-0.5">{formatDate(rec.date)}</p>
              </div>
              <div className="flex items-center gap-1.5 ml-3 shrink-0">
                <span className="text-white/30 text-xs font-mono">{rec.languagePair}</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-white/50 text-xs">
                {formatDuration(rec.durationSeconds)}
              </span>
              <span className="text-white/20">|</span>
              <span className="text-white/50 text-xs">
                {formatFileSize(rec.sizeBytes)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {/* Play */}
              <button
                onClick={() => {
                  setPlayingId(rec.id);
                  handlePlay(rec.id).finally(() => setPlayingId(null));
                }}
                disabled={playingId === rec.id}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all min-h-[44px]"
                style={{
                  background: "rgba(0, 200, 150, 0.1)",
                  border: "1px solid rgba(0, 200, 150, 0.2)",
                  color: "#00C896",
                }}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {playingId === rec.id ? "Opening..." : "Play"}
              </button>

              {/* Download */}
              <button
                onClick={() => handleDownload(rec.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all min-h-[44px]"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(rec.id)}
                disabled={deletingId === rec.id}
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all"
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.15)",
                  color: deletingId === rec.id ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.6)",
                }}
                aria-label="Delete recording"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      {recordings.length > 0 && (
        <div className="px-4 pb-8 pt-2">
          <p className="text-white/25 text-[11px] text-center leading-relaxed">
            Recordings are stored locally on this device. Max 10 recordings — oldest are auto-deleted.
          </p>
        </div>
      )}
    </div>
  );
}
