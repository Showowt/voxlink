"use client";

import { forwardRef, type ReactNode, type HTMLAttributes } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS CARD - Premium glassmorphism container
// Apple-level aesthetic with depth and blur effects
// ═══════════════════════════════════════════════════════════════════════════════

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
  glow?: "none" | "voxxo" | "blue" | "gold" | "error";
  animate?: boolean;
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      variant = "default",
      padding = "md",
      glow = "none",
      animate = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    // Base styles
    const baseStyles =
      "relative backdrop-blur-xl rounded-2xl border transition-all duration-300";

    // Variant styles
    const variants = {
      default:
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/[0.12]",
      elevated:
        "bg-gradient-to-br from-white/[0.10] to-white/[0.04] border-white/[0.15] shadow-glass-lg",
      subtle: "bg-white/[0.04] border-white/[0.08]",
      interactive:
        "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/[0.12] hover:border-white/[0.20] hover:bg-white/[0.10] cursor-pointer",
    };

    // Padding styles
    const paddings = {
      none: "",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-6",
      lg: "p-6 sm:p-8",
    };

    // Glow styles (applied via box-shadow)
    const glowStyles = {
      none: "",
      voxxo: "shadow-glow-voxxo",
      blue: "shadow-glow-blue",
      gold: "shadow-glow-gold",
      error: "shadow-glow-error",
    };

    // Animation
    const animationStyles = animate ? "animate-fade-up" : "";

    // Box shadow for depth
    const shadowStyle =
      variant === "elevated"
        ? "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)"
        : "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)";

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${glowStyles[glow]} ${animationStyles} ${className}`}
        style={{ boxShadow: shadowStyle }}
        {...props}
      >
        {children}
      </div>
    );
  },
);

GlassCard.displayName = "GlassCard";

export default GlassCard;
export { GlassCard };
