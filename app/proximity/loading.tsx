// ═══════════════════════════════════════════════════════════════════════════════
// PROXIMITY CONNECT - PREMIUM LOADING STATE
// Shows skeleton UI while Proximity discovery loads
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProximityLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex flex-col safe-all">
      {/* Header skeleton */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="skeleton-shimmer w-8 h-8 rounded-lg" />
            <div className="skeleton-shimmer h-6 w-32 rounded-lg" />
          </div>
          <div className="skeleton-shimmer h-7 w-16 rounded-full" />
        </div>
      </div>

      {/* Main radar area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-72 h-72">
          {/* Radar rings skeleton */}
          {[1, 2, 3].map((ring) => (
            <div
              key={ring}
              className="absolute inset-0 rounded-full border border-purple-500/20"
              style={{
                transform: `scale(${0.33 * ring})`,
              }}
            />
          ))}

          {/* Center user dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="skeleton-shimmer-voxxo w-16 h-16 rounded-full" />
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  background:
                    "radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)",
                  animationDuration: "2s",
                }}
              />
            </div>
          </div>

          {/* Nearby user dots skeleton */}
          {[
            { angle: 45, distance: 60 },
            { angle: 120, distance: 80 },
            { angle: 200, distance: 50 },
            { angle: 300, distance: 90 },
          ].map((pos, i) => {
            const x = Math.cos((pos.angle * Math.PI) / 180) * pos.distance;
            const y = Math.sin((pos.angle * Math.PI) / 180) * pos.distance;
            return (
              <div
                key={i}
                className="absolute skeleton-shimmer w-10 h-10 rounded-full"
                style={{
                  left: `calc(50% + ${x}px - 20px)`,
                  top: `calc(50% + ${y}px - 20px)`,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            );
          })}

          {/* Rotating radar sweep */}
          <div
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(168, 85, 247, 0.15) 30deg, transparent 60deg)",
              animationDuration: "3s",
              animationTimingFunction: "linear",
            }}
          />
        </div>
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center py-4">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-3">
            <div className="absolute inset-0 rounded-full border-2 border-white/10" />
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
              style={{
                borderTopColor: "#A855F7",
                borderRightColor: "rgba(168, 85, 247, 0.5)",
                animationDuration: "1s",
                animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>
          <p className="text-gray-400 text-sm">Loading Proximity Connect...</p>
        </div>
      </div>

      {/* Bottom panel skeleton */}
      <div className="p-4 border-t border-white/[0.06] safe-bottom">
        <div className="max-w-lg mx-auto">
          {/* Nearby users list skeleton */}
          <div className="space-y-3 mb-4">
            <div className="skeleton-shimmer h-4 w-24 rounded-lg mb-2" />
            {[1, 2].map((i) => (
              <div key={i} className="glass rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <div className="skeleton-shimmer w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <div className="skeleton-shimmer h-4 w-24 rounded-lg mb-1" />
                    <div className="skeleton-shimmer h-3 w-16 rounded-lg" />
                  </div>
                  <div className="skeleton-shimmer h-8 w-16 rounded-lg" />
                </div>
              </div>
            ))}
          </div>

          {/* Action button skeleton */}
          <div className="skeleton-shimmer h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
