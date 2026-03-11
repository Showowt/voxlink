"use client";

import {
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
  type CSSProperties,
} from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS CARD - Premium glassmorphism container
// Apple-level iOS Control Center aesthetic with depth, blur, and inner highlights
// ═══════════════════════════════════════════════════════════════════════════════

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "elevated" | "subtle" | "interactive" | "premium";
  padding?: "none" | "sm" | "md" | "lg";
  glow?: "none" | "voxxo" | "blue" | "gold" | "error" | "success";
  animate?: boolean;
}

// Extended CSSProperties to include webkit prefixes
interface GlassStyles extends CSSProperties {
  WebkitBackdropFilter?: string;
  WebkitBackfaceVisibility?: "hidden" | "visible";
  WebkitTapHighlightColor?: string;
  WebkitUserSelect?: "none" | "auto" | "text" | "all";
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
    // Base styles with GPU acceleration for smooth backdrop-filter
    const baseStyles =
      "relative rounded-2xl border transition-all duration-200";

    // Variant-specific inline styles for premium glassmorphism
    // Using inline styles ensures -webkit-backdrop-filter is always applied for Safari
    const variantStyles: Record<string, GlassStyles> = {
      default: {
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        boxShadow:
          "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      },
      elevated: {
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.04) 100%)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        borderColor: "rgba(255, 255, 255, 0.15)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.5), 0 16px 64px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      },
      subtle: {
        background: "rgba(255, 255, 255, 0.04)",
        backdropFilter: "blur(16px) saturate(120%)",
        WebkitBackdropFilter: "blur(16px) saturate(120%)",
        borderColor: "rgba(255, 255, 255, 0.06)",
        boxShadow:
          "0 2px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      },
      interactive: {
        background:
          "linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        boxShadow:
          "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        cursor: "pointer",
      },
      premium: {
        background: "rgba(255, 255, 255, 0.06)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        borderColor: "rgba(255, 255, 255, 0.1)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.1)",
      },
    };

    // Padding styles
    const paddings = {
      none: "",
      sm: "p-3 sm:p-4",
      md: "p-4 sm:p-6",
      lg: "p-6 sm:p-8",
    };

    // Glow styles (applied via additional box-shadow)
    const glowShadows: Record<string, string> = {
      none: "",
      voxxo:
        ", 0 0 40px rgba(0, 229, 160, 0.3), 0 0 80px rgba(0, 229, 160, 0.15)",
      blue: ", 0 0 40px rgba(0, 136, 255, 0.3), 0 0 80px rgba(0, 136, 255, 0.15)",
      gold: ", 0 0 40px rgba(245, 184, 0, 0.3), 0 0 80px rgba(245, 184, 0, 0.15)",
      error: ", 0 0 20px rgba(255, 71, 87, 0.3)",
      success: ", 0 0 20px rgba(0, 230, 118, 0.3)",
    };

    // Animation class
    const animationStyles = animate ? "animate-fade-up" : "";

    // Hover/active classes for interactive variant
    const interactiveClasses =
      variant === "interactive"
        ? "hover:border-white/[0.20] active:scale-[0.995] active:opacity-95 select-none"
        : "";

    // Combine box shadow with glow
    const baseShadow = (variantStyles[variant].boxShadow as string) || "";
    const combinedStyle: GlassStyles = {
      ...variantStyles[variant],
      boxShadow: baseShadow + glowShadows[glow],
      // GPU acceleration for smooth animations
      transform: "translateZ(0)",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
    };

    // Touch interaction props for interactive variant
    const touchProps =
      variant === "interactive"
        ? {
            "data-haptic": "impact-light",
            "data-touch-feedback": "true",
            role: "button" as const,
            tabIndex: 0,
          }
        : {};

    // Add touch-specific styles for interactive
    if (variant === "interactive") {
      combinedStyle.touchAction = "manipulation";
      combinedStyle.WebkitTapHighlightColor = "transparent";
      combinedStyle.WebkitUserSelect = "none";
      combinedStyle.userSelect = "none";
    }

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${paddings[padding]} ${interactiveClasses} ${animationStyles} ${className}`}
        style={combinedStyle}
        {...touchProps}
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
