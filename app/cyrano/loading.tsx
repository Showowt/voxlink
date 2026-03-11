// ═══════════════════════════════════════════════════════════════════════════════
// CYRANO MODE - PREMIUM LOADING STATE
// Shows skeleton UI while Cyrano AI translator loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function CyranoLoading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex flex-col safe-all">
      {/* Header skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="skeleton-shimmer h-8 w-28 rounded-lg" />
          <div className="skeleton-shimmer h-8 w-20 rounded-full" />
        </div>
      </div>

      {/* Conversation area skeleton */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Message bubbles skeleton */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`glass rounded-2xl p-4 max-w-[80%] ${
                  i % 2 === 0 ? "rounded-br-md" : "rounded-bl-md"
                }`}
              >
                <div className="space-y-2">
                  <div
                    className="skeleton-shimmer h-4 rounded-lg"
                    style={{ width: `${60 + i * 10}%` }}
                  />
                  <div
                    className="skeleton-shimmer h-4 rounded-lg"
                    style={{ width: `${40 + i * 15}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center py-6">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-3">
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
          <p className="text-white/60 text-sm">Loading Cyrano...</p>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="p-4 border-t border-white/[0.06] safe-bottom">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
          <div className="skeleton-shimmer h-12 w-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
