// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO CALL - PREMIUM LOADING STATE
// Shows skeleton UI while video call page loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function CallLoading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex flex-col safe-all">
      {/* Header skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          {/* Code skeleton */}
          <div className="skeleton-shimmer h-8 w-28 rounded-lg" />
          {/* Status badge skeleton */}
          <div className="skeleton-shimmer h-6 w-20 rounded-full" />
        </div>
      </div>

      {/* Main video area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {/* Remote video skeleton */}
          <div className="relative aspect-video glass rounded-2xl overflow-hidden mb-4">
            <div className="absolute inset-0 skeleton-shimmer" />

            {/* Centered loader */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="relative w-16 h-16 mx-auto mb-4">
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
                </div>
                <p className="text-white/60 text-sm">Preparing video call...</p>
              </div>
            </div>

            {/* Local video skeleton (PiP) */}
            <div className="absolute bottom-4 right-4 w-32 h-24 skeleton-shimmer rounded-xl" />
          </div>

          {/* Translation panel skeleton */}
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="skeleton-shimmer w-8 h-8 rounded-full" />
              <div className="skeleton-shimmer h-4 w-24 rounded-lg" />
            </div>
            <div className="space-y-2">
              <div className="skeleton-shimmer h-5 w-full rounded-lg" />
              <div className="skeleton-shimmer h-5 w-4/5 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom controls skeleton */}
      <div className="p-4 border-t border-white/[0.06] safe-bottom">
        <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
          <div className="skeleton-shimmer w-12 h-12 rounded-full" />
          <div className="skeleton-shimmer w-12 h-12 rounded-full" />
          <div className="skeleton-shimmer w-14 h-14 rounded-full" />
          <div className="skeleton-shimmer w-12 h-12 rounded-full" />
          <div className="skeleton-shimmer w-12 h-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}
