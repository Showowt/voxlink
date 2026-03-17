// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ - PREMIUM ROOT LOADING STATE
// World-class loading animation with brand identity
// ═══════════════════════════════════════════════════════════════════════════════

export default function Loading() {
  return (
    <div className="min-h-screen bg-void-DEFAULT flex items-center justify-center safe-all">
      <div className="text-center">
        {/* Premium spinning loader */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />

          {/* Spinning gradient ring */}
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
            style={{
              borderTopColor: "#00E5A0",
              borderRightColor: "rgba(0, 229, 160, 0.5)",
              animationDuration: "1s",
              animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />

          {/* Inner glow */}
          <div
            className="absolute inset-2 rounded-full animate-pulse"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.2) 0%, transparent 70%)",
            }}
          />
        </div>

        {/* Loading text */}
        <p className="text-white/60 text-base font-medium">
          Loading Entrevoz...
        </p>

        {/* Subtle tagline */}
        <p className="text-white/40 text-sm mt-1">
          Your Voice. Any Language. Instantly.
        </p>
      </div>
    </div>
  );
}
