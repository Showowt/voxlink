"use client";

import { type FC, type ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED BACKGROUND - Premium gradient mesh with optional particles
// Features: gradient mesh, noise overlay, animated orbs
// ═══════════════════════════════════════════════════════════════════════════════

interface AnimatedBackgroundProps {
  children: ReactNode;
  variant?: "default" | "mesh" | "void" | "premium";
  className?: string;
}

const AnimatedBackground: FC<AnimatedBackgroundProps> = ({
  children,
  variant = "default",
  className = "",
}) => {
  // Background configurations
  const backgrounds = {
    default: "bg-void-DEFAULT",
    mesh: "bg-void-DEFAULT bg-mesh-voxxo",
    void: "bg-gradient-to-br from-void-DEFAULT via-void-surface to-void-DEFAULT",
    premium: "bg-void-DEFAULT bg-mesh-premium",
  };

  return (
    <div
      className={`relative min-h-[100dvh] ${backgrounds[variant]} ${className}`}
    >
      {/* Animated Gradient Orbs */}
      {(variant === "mesh" || variant === "premium") && (
        <>
          {/* Top-left orb */}
          <div
            className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.15) 0%, transparent 70%)",
              animation: "float 20s ease-in-out infinite",
            }}
          />

          {/* Bottom-right orb */}
          <div
            className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 136, 255, 0.15) 0%, transparent 70%)",
              animation: "float 25s ease-in-out infinite reverse",
            }}
          />

          {/* Center subtle orb */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.1) 0%, transparent 60%)",
              animation: "pulse-soft 10s ease-in-out infinite",
            }}
          />
        </>
      )}

      {/* Noise overlay for texture */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>

      {/* Float animation */}
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0) translateX(0);
          }
          25% {
            transform: translateY(-20px) translateX(10px);
          }
          50% {
            transform: translateY(0) translateX(20px);
          }
          75% {
            transform: translateY(20px) translateX(10px);
          }
        }
      `}</style>
    </div>
  );
};

export default AnimatedBackground;
export { AnimatedBackground };
