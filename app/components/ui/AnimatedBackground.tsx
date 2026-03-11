"use client";

import { type FC, type ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED BACKGROUND - GPU-ACCELERATED PREMIUM GRADIENT MESH
// Performance optimized for 60fps with compositor-only animations
// Features: gradient mesh, noise overlay, animated orbs (GPU-accelerated)
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
      className={`relative min-h-screen-safe safe-x ${backgrounds[variant]} ${className}`}
    >
      {/* Animated Gradient Orbs - GPU-accelerated with will-change and transform3d */}
      {(variant === "mesh" || variant === "premium") && (
        <>
          {/* Top-left orb - uses floatOrb animation from globals.css */}
          <div
            className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl pointer-events-none animate-float-orb gpu-accelerated"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.15) 0%, transparent 70%)",
              willChange: "transform",
            }}
            aria-hidden="true"
          />

          {/* Bottom-right orb */}
          <div
            className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-25 blur-3xl pointer-events-none animate-float-orb-reverse gpu-accelerated"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 136, 255, 0.15) 0%, transparent 70%)",
              willChange: "transform",
            }}
            aria-hidden="true"
          />

          {/* Center subtle orb - uses pulseSoft for opacity animation (GPU-accelerated) */}
          <div
            className="absolute top-1/2 left-1/2 w-[800px] h-[800px] rounded-full opacity-10 blur-3xl pointer-events-none animate-pulse-soft gpu-accelerated"
            style={{
              background:
                "radial-gradient(circle, rgba(0, 229, 160, 0.1) 0%, transparent 60%)",
              transform: "translate3d(-50%, -50%, 0)",
              willChange: "opacity",
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Noise overlay for texture - static, no animation needed */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default AnimatedBackground;
export { AnimatedBackground };
