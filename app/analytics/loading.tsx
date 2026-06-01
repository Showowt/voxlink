// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD - LOADING STATE
// Skeleton UI matching the dashboard layout
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#060810] text-white safe-top safe-bottom">
      {/* Header skeleton */}
      <header className="border-b border-white/[0.06] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.06] animate-pulse" />
            <div className="h-6 w-40 rounded bg-white/[0.06] animate-pulse" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-16 rounded-lg bg-white/[0.06] animate-pulse" />
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Metric cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[#12121a] border border-white/[0.06] rounded-xl p-4 sm:p-5">
              <div className="h-3 w-20 rounded bg-white/[0.06] animate-pulse mb-3" />
              <div className="h-8 w-24 rounded bg-white/[0.06] animate-pulse mb-2" />
              <div className="h-3 w-16 rounded bg-white/[0.06] animate-pulse" />
            </div>
          ))}
        </div>

        {/* Chart skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#12121a] border border-white/[0.06] rounded-xl p-5">
            <div className="h-4 w-40 rounded bg-white/[0.06] animate-pulse mb-6" />
            <div className="flex items-end gap-1 h-40">
              {Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-white/[0.04] animate-pulse"
                  style={{ height: `${20 + Math.random() * 80}%` }}
                />
              ))}
            </div>
          </div>
          <div className="bg-[#12121a] border border-white/[0.06] rounded-xl p-5">
            <div className="h-4 w-40 rounded bg-white/[0.06] animate-pulse mb-6" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 w-12 rounded bg-white/[0.06] animate-pulse" />
                  <div className="flex-1 h-5 rounded bg-white/[0.04] animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
