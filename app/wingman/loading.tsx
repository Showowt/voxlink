// ═══════════════════════════════════════════════════════════════════════════════
// WINGMAN MODE - PREMIUM LOADING STATE
// Shows skeleton UI while Wingman AI coach loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function WingmanLoading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex flex-col safe-all">
      {/* Header skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Back button + Title skeleton */}
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer w-8 h-8 rounded-lg" />
            <div className="skeleton-shimmer h-6 w-24 rounded-lg" />
          </div>
          {/* Mode badge skeleton */}
          <div className="skeleton-shimmer h-7 w-20 rounded-full" />
        </div>
      </div>

      {/* Mode selector skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex gap-2 max-w-lg mx-auto skeleton-stagger">
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {/* Headphones icon skeleton */}
        <div className="relative w-24 h-24 mb-6">
          <div className="skeleton-shimmer-voxxo w-full h-full rounded-full" />
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{
              background:
                "radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)",
              animationDuration: "2s",
            }}
          />
        </div>

        {/* Instructions card skeleton */}
        <div className="glass rounded-2xl p-5 max-w-sm w-full mb-6">
          <div className="skeleton-shimmer h-5 w-3/4 rounded-lg mb-3 mx-auto" />
          <div className="space-y-2">
            <div className="skeleton-shimmer h-4 w-full rounded-lg" />
            <div className="skeleton-shimmer h-4 w-5/6 rounded-lg" />
            <div className="skeleton-shimmer h-4 w-4/5 rounded-lg" />
          </div>
        </div>

        {/* Premium spinner */}
        <div className="relative w-14 h-14 mb-3">
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{
              borderTopColor: "#8B5CF6",
              borderRightColor: "rgba(139, 92, 246, 0.5)",
              animationDuration: "1s",
              animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        <p className="text-white/60 text-sm">Loading Wingman...</p>
        <p className="text-white/40 text-xs mt-1">
          Connect AirPods for best experience
        </p>
      </div>

      {/* Bottom button skeleton */}
      <div className="p-4 safe-bottom">
        <div className="max-w-lg mx-auto">
          <div className="skeleton-shimmer h-14 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
