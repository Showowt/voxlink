"use client";

/**
 * Error boundary for Wingman Mode
 * Handles crashes gracefully with retry option
 */

import { useEffect } from "react";

export default function WingmanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Wingman Error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4">🎧</div>
        <h1 className="text-2xl font-bold mb-2">Wingman Hit a Snag</h1>
        <p className="text-white/70 text-sm mb-6">
          Something went wrong loading Wingman Mode. This might be due to
          browser permissions or an unsupported browser.
        </p>

        <div className="bg-white/5 rounded-xl p-4 mb-6 text-left">
          <p className="text-xs text-white/70 font-mono break-all">
            {error.message || "Unknown error"}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-white/90 transition-all"
          >
            Try Again
          </button>
          <a
            href="/"
            className="w-full bg-white/10 text-white py-3 rounded-xl text-center hover:bg-white/15 transition-all"
          >
            Back to Home
          </a>
        </div>

        <div className="mt-8 text-xs text-white/70">
          <p className="font-semibold mb-2">Troubleshooting:</p>
          <ul className="space-y-1 text-left">
            <li>• Use Chrome, Safari, or Edge (latest version)</li>
            <li>• Allow microphone access when prompted</li>
            <li>• Disable ad blockers or privacy extensions</li>
            <li>• Try refreshing the page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
