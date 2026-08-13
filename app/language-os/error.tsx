"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LanguageOSError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Language OS] Route error:", error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] bg-[#06060a] flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-4">🌀</div>
      <h2 className="text-white text-lg font-semibold mb-2">
        Something interrupted your practice
      </h2>
      <p className="text-white/40 text-sm max-w-xs mb-6">
        Your progress is saved. Try again, or head back to pick a language.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="px-5 py-3 min-h-[44px] rounded-2xl bg-[#00C896] text-[#06060a] text-sm font-semibold active:scale-95 transition-all"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/language-os")}
          className="px-5 py-3 min-h-[44px] rounded-2xl bg-white/[0.06] text-white/70 text-sm font-medium border border-white/[0.08] active:scale-95 transition-all"
        >
          Back to languages
        </button>
      </div>
    </div>
  );
}
