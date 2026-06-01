export default function AccountLoading() {
  return (
    <div className="min-h-[100dvh] bg-[#060810] flex items-center justify-center safe-all">
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
        <p className="text-white/60 text-base font-medium">
          Loading Account...
        </p>
      </div>
    </div>
  );
}
