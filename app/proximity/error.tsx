"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY ERROR BOUNDARY - Graceful error handling for proximity discovery
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProximityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">📡</div>
        <h2 className="text-2xl font-bold text-white mb-3">Proximity Error</h2>
        <p className="text-gray-400 mb-6">
          {error.message || "Something went wrong with proximity discovery."}
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] text-white font-semibold rounded-xl hover:from-[#00B085] hover:to-[#0055DD] transition min-h-[44px]"
          >
            Try Again
          </button>
          <a
            href="/"
            className="block w-full py-3 bg-[#1a1a2e] border border-gray-700 text-white rounded-xl hover:border-gray-600 transition min-h-[44px] text-center"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
