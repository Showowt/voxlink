// ═══════════════════════════════════════════════════════════════════════════════
// FACE-TO-FACE MODE - PREMIUM LOADING STATE
// Shows skeleton UI while Face-to-Face translator loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function FaceToFaceLoading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex flex-col safe-all">
      {/* Person A side */}
      <div className="flex-1 flex flex-col p-4 border-b border-white/[0.08]">
        {/* Language selector skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton-shimmer h-10 w-32 rounded-xl" />
          <div className="skeleton-shimmer h-8 w-8 rounded-lg" />
        </div>

        {/* Speech area skeleton */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm">
            {/* Recording button skeleton */}
            <div className="skeleton-shimmer w-24 h-24 rounded-full mx-auto mb-4" />

            {/* Transcript card skeleton */}
            <div className="glass rounded-2xl p-4">
              <div className="space-y-2">
                <div className="skeleton-shimmer h-5 w-full rounded-lg" />
                <div className="skeleton-shimmer h-5 w-3/4 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Divider with swap button */}
      <div className="relative py-2">
        <div className="absolute inset-x-4 top-1/2 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />
        <div className="relative flex justify-center">
          <div className="skeleton-shimmer w-12 h-12 rounded-full" />
        </div>
      </div>

      {/* Person B side */}
      <div className="flex-1 flex flex-col p-4 rotate-180">
        {/* Language selector skeleton */}
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton-shimmer h-10 w-32 rounded-xl" />
          <div className="skeleton-shimmer h-8 w-8 rounded-lg" />
        </div>

        {/* Speech area skeleton */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm">
            {/* Recording button skeleton */}
            <div className="skeleton-shimmer w-24 h-24 rounded-full mx-auto mb-4" />

            {/* Transcript card skeleton */}
            <div className="glass rounded-2xl p-4">
              <div className="space-y-2">
                <div className="skeleton-shimmer h-5 w-full rounded-lg" />
                <div className="skeleton-shimmer h-5 w-3/4 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      <div className="absolute inset-0 bg-void-DEFAULT/80 flex items-center justify-center backdrop-blur-sm">
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
            <div
              className="absolute inset-2 rounded-full animate-pulse"
              style={{
                background:
                  "radial-gradient(circle, rgba(0, 229, 160, 0.2) 0%, transparent 70%)",
              }}
            />
          </div>
          <p className="text-white/60 text-sm">Loading Face-to-Face...</p>
          <p className="text-white/40 text-xs mt-1">
            Place phone between two people
          </p>
        </div>
      </div>
    </div>
  );
}
