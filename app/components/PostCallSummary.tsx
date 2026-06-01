"use client";

import { useState, useCallback } from "react";

const FEATURE_POST_CALL = true;

interface TranscriptMessage {
  original: string;
  translated: string;
  sender: "me" | "partner";
  timestamp?: string;
}

interface SummaryData {
  overview: string;
  keyPhrases: Array<{ original: string; translation: string; language: string }>;
  followUps: string[];
  mood: string;
}

interface PostCallSummaryProps {
  visible: boolean;
  messages: TranscriptMessage[];
  duration: number;
  languages: string[];
  onClose: () => void;
  onNewCall: () => void;
  hasRecording?: boolean;
  onDownloadRecording?: () => void;
}

export default function PostCallSummary({
  visible,
  messages,
  duration,
  languages,
  onClose,
  onNewCall,
  hasRecording,
  onDownloadRecording,
}: PostCallSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generateSummary = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, duration, languages }),
      });

      if (!res.ok) throw new Error("Failed to generate summary");

      const data = await res.json();
      setSummary(data);

      // Save to localStorage
      const history = JSON.parse(localStorage.getItem("entrevoz_summaries") || "[]");
      history.unshift({ ...data, duration, languages, date: new Date().toISOString() });
      localStorage.setItem("entrevoz_summaries", JSON.stringify(history.slice(0, 20)));
    } catch (err) {
      setError("Could not generate summary. Try again.");
      console.error("[PostCall]", err);
    } finally {
      setLoading(false);
    }
  }, [messages, duration, languages]);

  const shareSummary = useCallback(() => {
    if (!summary) return;
    const text = [
      `Entrevoz Call Summary (${Math.round(duration / 60)} min)`,
      "",
      summary.overview,
      "",
      "Key Phrases:",
      ...summary.keyPhrases.map((p) => `  ${p.original} = ${p.translation}`),
      "",
      summary.followUps.length > 0 ? "Follow-ups:" : "",
      ...summary.followUps.map((f) => `  - ${f}`),
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [summary, duration]);

  if (!FEATURE_POST_CALL || !visible) return null;

  const mins = Math.round(duration / 60);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto overscroll-contain mx-4 mb-4 md:mb-0 rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, #111114 0%, #0a0a0e 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold">Call Complete</h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
            <div className="text-white text-lg font-semibold">{mins}</div>
            <div className="text-white/40 text-xs">minutes</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
            <div className="text-white text-lg font-semibold">{messages.length}</div>
            <div className="text-white/40 text-xs">messages</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
            <div className="text-white text-lg font-semibold">{languages.join(" / ")}</div>
            <div className="text-white/40 text-xs">languages</div>
          </div>
        </div>

        {/* Summary content OR generate button */}
        {!summary && !loading && (
          <button
            onClick={generateSummary}
            disabled={messages.length < 2}
            className="w-full py-3 rounded-xl text-sm font-medium transition-all mb-4 disabled:opacity-30"
            style={{
              background: "linear-gradient(135deg, rgba(0,200,150,0.15), rgba(0,150,200,0.15))",
              border: "1px solid rgba(0,200,150,0.3)",
              color: "#00C896",
            }}
          >
            Generate AI Summary
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6 mb-4">
            <div className="w-6 h-6 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin mr-3" />
            <span className="text-white/50 text-sm">Analyzing conversation...</span>
          </div>
        )}

        {error && (
          <div className="text-red-400/80 text-sm text-center py-2 mb-4">{error}</div>
        )}

        {summary && (
          <div className="space-y-4 mb-4">
            {/* Overview */}
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-white/80 text-sm leading-relaxed">{summary.overview}</p>
              {summary.mood && (
                <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                  {summary.mood === "warm" && "Warm"}{summary.mood === "playful" && "Playful"}{summary.mood === "professional" && "Professional"}{summary.mood === "tense" && "Tense"}
                </span>
              )}
            </div>

            {/* Key Phrases */}
            {summary.keyPhrases.length > 0 && (
              <div>
                <h3 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">
                  Key Phrases
                </h3>
                <div className="space-y-2">
                  {summary.keyPhrases.map((phrase, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-2.5 border-l-2 border-[#00C896]/50">
                      <p className="text-white text-sm font-medium">{phrase.original}</p>
                      <p className="text-white/50 text-xs mt-0.5">{phrase.translation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-ups */}
            {summary.followUps.length > 0 && (
              <div>
                <h3 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">
                  Follow-ups
                </h3>
                <div className="space-y-1.5">
                  {summary.followUps.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-white/70">
                      <span className="text-[#00C896] mt-0.5">-</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share button */}
            <button
              onClick={shareSummary}
              className="w-full py-2 rounded-lg text-xs font-medium bg-white/5 text-white/50 hover:text-white/70 border border-white/5 transition-colors"
            >
              {copied ? "Copied to clipboard!" : "Copy summary"}
            </button>
          </div>
        )}

        {/* Recording Download */}
        {hasRecording && onDownloadRecording && (
          <div className="mb-3 pt-2 border-t border-white/5">
            <button
              onClick={onDownloadRecording}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Recording
            </button>
            <a
              href="/recordings"
              className="block text-center text-xs text-white/30 hover:text-white/50 transition-colors mt-2"
            >
              View all recordings
            </a>
          </div>
        )}

        {/* Practice CTA */}
        <div className="mb-3 pt-2 border-t border-white/5">
          <a
            href="/language-os"
            className="block w-full py-3 rounded-xl text-sm font-medium text-center transition-all"
            style={{
              background: "rgba(0,200,150,0.08)",
              border: "1px solid rgba(0,200,150,0.2)",
              color: "#00C896",
            }}
          >
            Practice vocab from this call
          </a>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 text-white/60 hover:text-white/80 transition-colors"
          >
            Close
          </button>
          <button
            onClick={onNewCall}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
            style={{
              background: "rgba(0,200,150,0.15)",
              border: "1px solid rgba(0,200,150,0.3)",
              color: "#00C896",
            }}
          >
            New Call
          </button>
        </div>
      </div>
    </div>
  );
}
