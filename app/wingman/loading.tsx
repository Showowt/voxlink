/**
 * Loading state for Wingman Mode
 * Shows while the page JS is loading
 */

export default function WingmanLoading() {
  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Animated headphones */}
        <div className="text-5xl animate-pulse">🎧</div>

        {/* Loading dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/60 animate-bounce"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>

        <p className="text-white/40 text-sm">Loading Wingman...</p>
      </div>
    </div>
  );
}
