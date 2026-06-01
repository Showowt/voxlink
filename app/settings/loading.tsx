// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ SETTINGS - LOADING SKELETON
// Premium loading state matching app design system
// ═══════════════════════════════════════════════════════════════════════════════

export default function SettingsLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#060810] safe-all">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] animate-pulse" />
          <div className="h-6 w-24 rounded-lg bg-white/[0.06] animate-pulse" />
        </div>

        {/* Section skeletons */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mb-6">
            <div className="h-3 w-32 rounded bg-white/[0.06] animate-pulse mb-4" />
            <div className="rounded-2xl bg-[#12121a] border border-white/[0.06] p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-36 rounded bg-white/[0.06] animate-pulse" />
                <div className="w-11 h-6 rounded-full bg-white/[0.06] animate-pulse" />
              </div>
              <div className="flex justify-between items-center">
                <div className="h-4 w-28 rounded bg-white/[0.06] animate-pulse" />
                <div className="w-11 h-6 rounded-full bg-white/[0.06] animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
