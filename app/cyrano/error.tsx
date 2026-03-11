"use client";

export default function CyranoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">💬</div>
        <h2 className="text-2xl font-bold text-white mb-3">Cyrano Error</h2>
        <p className="text-white/70 mb-6">{error.message || "Something went wrong."}</p>
        <div className="space-y-3">
          <button onClick={reset} className="w-full py-4 bg-white text-black font-bold rounded-xl min-h-[56px]">Try Again</button>
          <a href="/" className="block w-full py-4 bg-white/10 text-white rounded-xl min-h-[56px] text-center">Go Home</a>
        </div>
      </div>
    </div>
  );
}
