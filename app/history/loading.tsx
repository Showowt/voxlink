// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY PAGE - LOADING SKELETON
// Premium shimmer skeleton while history loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function HistoryLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#060810]">
      <div className="w-full max-w-md mx-auto px-4 py-4">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-6">
          <div className="skeleton-shimmer w-10 h-10 rounded-xl" />
          <div className="skeleton-shimmer h-6 w-40 rounded-lg" />
        </div>

        {/* Search bar skeleton */}
        <div className="skeleton-shimmer h-12 w-full rounded-xl mb-4" />

        {/* Tab toggle skeleton */}
        <div className="flex gap-2 mb-6">
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
          <div className="skeleton-shimmer h-10 flex-1 rounded-xl" />
        </div>

        {/* Translation item skeletons */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="mb-3 rounded-2xl p-4"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="skeleton-shimmer h-4 w-24 rounded-lg" />
              <div className="skeleton-shimmer h-8 w-8 rounded-lg" />
            </div>
            <div className="skeleton-shimmer h-4 w-full rounded-lg mb-2" />
            <div className="skeleton-shimmer h-4 w-3/4 rounded-lg mb-3" />
            <div className="skeleton-shimmer h-3 w-32 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
