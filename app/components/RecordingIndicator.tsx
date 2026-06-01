"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// RECORDING INDICATOR — Pulsing red dot + REC + duration timer
// Positioned in top-right of call page, minimal footprint
// ═══════════════════════════════════════════════════════════════════════════════

interface RecordingIndicatorProps {
  durationSeconds: number;
}

function formatRecDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function RecordingIndicator({ durationSeconds }: RecordingIndicatorProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg pointer-events-none select-none"
      style={{
        background: "rgba(239, 68, 68, 0.15)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Pulsing red dot */}
      <div className="relative w-2.5 h-2.5 shrink-0">
        <div className="absolute inset-0 rounded-full bg-red-500" />
        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
      </div>

      {/* REC label */}
      <span
        className="text-[10px] font-bold tracking-[0.12em] uppercase"
        style={{ color: "#ef4444" }}
      >
        REC
      </span>

      {/* Duration */}
      <span className="text-[10px] font-mono text-red-400/80 tabular-nums">
        {formatRecDuration(durationSeconds)}
      </span>
    </div>
  );
}
