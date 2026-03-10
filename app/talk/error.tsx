"use client";

import { useEffect } from "react";

export default function TalkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Voxxo Talk Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="text-6xl mb-4">💬</div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Conversation Error
        </h2>
        <p className="text-gray-400 mb-6">
          There was a problem with your conversation. This could be due to
          microphone permissions or connection issues.
        </p>
        <div className="space-y-3">
          <button
            onClick={reset}
            className="w-full px-6 py-3 bg-[#00DBA8] hover:bg-[#00C896] text-white rounded-xl font-medium transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
          >
            Return Home
          </button>
        </div>
      </div>
    </div>
  );
}
