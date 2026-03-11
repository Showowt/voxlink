"use client";

import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// GLOW BUTTON - Premium CTA with gradient and glow effects
// Features: gradient backgrounds, glow shadows, scale animations
// ═══════════════════════════════════════════════════════════════════════════════

interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
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
    // Base styles
    const baseStyles =
      "relative inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50";

    // Variant styles
    const variants = {
      primary: `
        bg-gradient-to-r from-voxxo-500 to-voxxo-600
        text-void-DEFAULT
        shadow-btn-primary
        hover:from-voxxo-400 hover:to-voxxo-500
        hover:shadow-btn-primary-hover hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
      secondary: `
        bg-white/[0.08] border border-white/[0.15]
        text-white/90
        shadow-glass
        hover:bg-white/[0.12] hover:border-white/25 hover:text-white hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:bg-white/[0.04] disabled:border-white/[0.08] disabled:text-gray-500 disabled:cursor-not-allowed
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
        shadow-lg shadow-red-500/25
        hover:from-red-400 hover:to-red-500 hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
      success: `
        bg-gradient-to-r from-emerald-500 to-green-600
        text-white
        shadow-lg shadow-emerald-500/25
        hover:from-emerald-400 hover:to-green-500 hover:shadow-xl hover:shadow-emerald-500/35 hover:-translate-y-0.5
        active:scale-[0.98] active:translate-y-0
        disabled:from-gray-600 disabled:to-gray-700 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed
      `,
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

    // Loading spinner
    const LoadingSpinner = () => (
      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
    );

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyles} ${className}`}
        disabled={disabled || loading}
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
