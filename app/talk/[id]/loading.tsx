// ═══════════════════════════════════════════════════════════════════════════════
// TALK MODE - PREMIUM LOADING STATE
// Shows skeleton UI while Talk page loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function TalkLoading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex flex-col safe-all">
      {/* Header skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Code skeleton */}
          <div className="skeleton-shimmer h-8 w-24 rounded-lg" />
          {/* Language badge skeleton */}
          <div className="skeleton-shimmer h-8 w-20 rounded-full" />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Connection status skeleton */}
        <div className="glass rounded-2xl p-6 max-w-sm w-full mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="skeleton-shimmer w-12 h-12 rounded-full" />
            <div className="flex-1">
              <div className="skeleton-shimmer h-5 w-3/4 rounded-lg mb-2" />
              <div className="skeleton-shimmer h-4 w-1/2 rounded-lg" />
            </div>
          </div>

          {/* Waveform skeleton */}
          <div className="flex items-center justify-center gap-1 h-12">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-shimmer w-1 rounded-full"
                style={{
                  height: `${20 + Math.sin(i * 0.5) * 15}px`,
                  animationDelay: `${i * 50}ms`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Premium spinner */}
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{
              borderTopColor: "#00E5A0",
              borderRightColor: "rgba(0, 229, 160, 0.5)",
              animationDuration: "1s",
              animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
          <div
            className="absolute inset-2 rounded-full animate-pulse"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.2) 0%, transparent 70%)",
            }}
          />
        </div>

        <p className="text-white/60 text-sm">Connecting...</p>
      </div>

      {/* Bottom controls skeleton */}
      <div className="p-4 border-t border-white/[0.06] safe-bottom">
        <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
          <div className="skeleton-shimmer w-14 h-14 rounded-full" />
          <div className="skeleton-shimmer w-14 h-14 rounded-full" />
          <div className="skeleton-shimmer w-14 h-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}
