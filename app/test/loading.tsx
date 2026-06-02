// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ - DEVICE TEST LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

export default function TestLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#060810] text-white safe-top safe-bottom">
      {/* Header skeleton */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl skeleton-shimmer" />
          <div className="space-y-2">
            <div className="w-28 h-5 rounded-md skeleton-shimmer" />
            <div className="w-40 h-3 rounded-md skeleton-shimmer" />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Button skeleton */}
        <div className="w-full h-12 rounded-xl skeleton-shimmer-entrevoz" />

        {/* Card skeletons */}
        <div className="space-y-2.5 skeleton-stagger">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-[#12121a] p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full skeleton-shimmer flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="w-32 h-4 rounded-md skeleton-shimmer" />
                  <div className="w-48 h-3 rounded-md skeleton-shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
