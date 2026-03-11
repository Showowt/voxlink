"use client";

import {
  forwardRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// GLOW BUTTON - Premium CTA with gradient, glow effects, and inner highlights
// Apple-level glassmorphism with depth and Safari compatibility
// ═══════════════════════════════════════════════════════════════════════════════

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "glass";
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
}

// Extended CSSProperties to include webkit prefixes
interface ButtonStyles extends CSSProperties {
  WebkitBackdropFilter?: string;
  WebkitTapHighlightColor?: string;
  WebkitTouchCallout?: "none" | "default";
  WebkitUserSelect?: "none" | "auto" | "text" | "all";
}

const GlowButton = forwardRef<HTMLButtonElement, GlowButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      icon,
      iconPosition = "left",
      className = "",
      disabled,
      ...props
    },
    ref,
  ) => {
    // Base styles with premium touch interactions
    const baseStyles = `
      relative inline-flex items-center justify-center font-semibold rounded-2xl
      transition-all duration-150 ease-out
      focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void-DEFAULT
      min-h-[44px]
      select-none
    `.trim();

    // Variant styles with inner highlights for depth
    const variants = {
      primary: `
        bg-gradient-to-r from-voxxo-500 to-voxxo-600
        text-void-DEFAULT
        hover:from-voxxo-400 hover:to-voxxo-500
        hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
      secondary: `
        text-white/90
        hover:text-white hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:text-gray-500 disabled:cursor-not-allowed
      `,
      ghost: `
        bg-transparent border border-transparent
        text-white/70
        hover:bg-white/[0.08] hover:text-white
        active:scale-[0.98]
        disabled:text-gray-600 disabled:cursor-not-allowed
      `,
      danger: `
        bg-gradient-to-r from-red-500 to-red-600
        text-white
        hover:from-red-400 hover:to-red-500 hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
      success: `
        bg-gradient-to-r from-emerald-500 to-green-600
        text-white
        hover:from-emerald-400 hover:to-green-500 hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
      glass: `
        text-white/90
        hover:text-white hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:text-gray-500 disabled:cursor-not-allowed
      `,
    };

    // Variant-specific inline styles for premium effects with Safari compatibility
    const variantStyles: Record<string, ButtonStyles> = {
      primary: {
        boxShadow:
          "0 4px 20px rgba(0, 229, 160, 0.25), 0 8px 40px rgba(0, 229, 160, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
      },
      secondary: {
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow:
          "0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      },
      ghost: {
        boxShadow: "none",
      },
      danger: {
        boxShadow:
          "0 4px 20px rgba(239, 68, 68, 0.25), 0 8px 40px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
      },
      success: {
        boxShadow:
          "0 4px 20px rgba(16, 185, 129, 0.25), 0 8px 40px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
      },
      glass: {
        background: "rgba(255, 255, 255, 0.06)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow:
          "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      },
    };

    // Hover shadow styles (applied via onMouseEnter/Leave for JS-based approach, or via CSS)
    const hoverStyles: Record<string, ButtonStyles> = {
      primary: {
        boxShadow:
          "0 6px 30px rgba(0, 229, 160, 0.35), 0 12px 50px rgba(0, 229, 160, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
      },
      secondary: {
        boxShadow:
          "0 6px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
      },
      danger: {
        boxShadow:
          "0 6px 30px rgba(239, 68, 68, 0.35), 0 12px 50px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
      },
      success: {
        boxShadow:
          "0 6px 30px rgba(16, 185, 129, 0.35), 0 12px 50px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
      },
      glass: {
        boxShadow:
          "0 6px 32px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      },
      ghost: {
        boxShadow: "none",
      },
    };

    // Size styles
    const sizes = {
      sm: "px-4 py-2 text-sm gap-1.5",
      md: "px-5 py-3 text-base gap-2",
      lg: "px-6 py-4 text-lg gap-2",
      xl: "px-8 py-5 text-xl gap-3",
    };

    // Width
    const widthStyles = fullWidth ? "w-full" : "";

    // Combined inline styles
    const combinedStyles: ButtonStyles = {
      ...variantStyles[variant],
      touchAction: "manipulation",
      WebkitTapHighlightColor: "transparent",
      WebkitTouchCallout: "none",
      WebkitUserSelect: "none",
      userSelect: "none",
      // GPU acceleration
      transform: "translateZ(0)",
      backfaceVisibility: "hidden",
    };

    // Apply disabled styles
    if (disabled || loading) {
      if (variant === "secondary" || variant === "glass") {
        combinedStyles.background = "rgba(255, 255, 255, 0.04)";
        combinedStyles.borderColor = "rgba(255, 255, 255, 0.08)";
        combinedStyles.boxShadow = "none";
      }
    }

    // Loading spinner
    const LoadingSpinner = () => (
      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
    );

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyles} ${className}`}
        disabled={disabled || loading}
        data-haptic={variant === "primary" ? "impact-medium" : "impact-light"}
        data-touch-feedback="true"
        style={combinedStyles}
        {...props}
      >
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {icon && iconPosition === "left" && (
              <span className="flex-shrink-0">{icon}</span>
            )}
            <span>{children}</span>
            {icon && iconPosition === "right" && (
              <span className="flex-shrink-0">{icon}</span>
            )}
          </>
        )}
      </button>
    );
  },
);

GlowButton.displayName = "GlowButton";

export default GlowButton;
export { GlowButton };
