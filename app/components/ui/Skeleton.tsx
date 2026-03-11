"use client";

import { type HTMLAttributes, forwardRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON COMPONENTS - Premium Loading States
// Apple-level shimmer animations with glassmorphism
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "line" | "circle" | "rectangle" | "button" | "card" | "avatar";
  width?: string | number;
  height?: string | number;
  animate?: boolean;
}

/**
 * Base Skeleton component with premium shimmer animation
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  (
    {
      variant = "line",
      width,
      height,
      animate = true,
      className = "",
      style,
      ...props
    },
    ref,
  ) => {
    // Default dimensions based on variant
    const getDefaultDimensions = () => {
      switch (variant) {
        case "circle":
          return { width: width ?? 40, height: height ?? 40 };
        case "avatar":
          return { width: width ?? 48, height: height ?? 48 };
        case "button":
          return { width: width ?? "100%", height: height ?? 44 };
        case "card":
          return { width: width ?? "100%", height: height ?? 120 };
        case "rectangle":
          return { width: width ?? "100%", height: height ?? 80 };
        case "line":
        default:
          return { width: width ?? "100%", height: height ?? 16 };
      }
    };

    const { width: defaultWidth, height: defaultHeight } =
      getDefaultDimensions();

    // Variant-specific classes
    const variantClasses = {
      line: "rounded-lg",
      circle: "rounded-full",
      avatar: "rounded-full",
      rectangle: "rounded-xl",
      button: "rounded-xl",
      card: "rounded-2xl",
    };

    return (
      <div
        ref={ref}
        className={`skeleton-shimmer ${variantClasses[variant]} ${className}`}
        style={{
          width:
            typeof defaultWidth === "number"
              ? `${defaultWidth}px`
              : defaultWidth,
          height:
            typeof defaultHeight === "number"
              ? `${defaultHeight}px`
              : defaultHeight,
          ...style,
        }}
        aria-hidden="true"
        {...props}
      />
    );
  },
);
Skeleton.displayName = "Skeleton";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LINE VARIANTS
// For text content loading
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonLineProps extends HTMLAttributes<HTMLDivElement> {
  width?: "full" | "3/4" | "1/2" | "1/3" | "1/4" | string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

export const SkeletonLine = forwardRef<HTMLDivElement, SkeletonLineProps>(
  ({ width = "full", size = "md", className = "", ...props }, ref) => {
    const widthClasses = {
      full: "w-full",
      "3/4": "w-3/4",
      "1/2": "w-1/2",
      "1/3": "w-1/3",
      "1/4": "w-1/4",
    };

    const sizeClasses = {
      xs: "h-2",
      sm: "h-3",
      md: "h-4",
      lg: "h-5",
      xl: "h-6",
    };

    const widthClass =
      width in widthClasses
        ? widthClasses[width as keyof typeof widthClasses]
        : "";

    return (
      <div
        ref={ref}
        className={`skeleton-shimmer rounded-lg ${widthClass} ${sizeClasses[size]} ${className}`}
        style={!(width in widthClasses) ? { width } : undefined}
        aria-hidden="true"
        {...props}
      />
    );
  },
);
SkeletonLine.displayName = "SkeletonLine";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON TEXT BLOCK
// Multiple lines with natural variation
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  size?: "sm" | "md" | "lg";
  lastLineWidth?: "3/4" | "1/2" | "1/3" | "full";
}

export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  (
    { lines = 3, size = "md", lastLineWidth = "3/4", className = "", ...props },
    ref,
  ) => {
    const sizeClasses = {
      sm: "h-3 mb-2",
      md: "h-4 mb-2.5",
      lg: "h-5 mb-3",
    };

    const lastWidthClasses = {
      full: "w-full",
      "3/4": "w-3/4",
      "1/2": "w-1/2",
      "1/3": "w-1/3",
    };

    return (
      <div ref={ref} className={`space-y-0 ${className}`} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`skeleton-shimmer rounded-lg ${sizeClasses[size]} ${
              i === lines - 1 ? lastWidthClasses[lastLineWidth] : "w-full"
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  },
);
SkeletonText.displayName = "SkeletonText";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON BUTTON
// Loading state for buttons
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonButtonProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
}

export const SkeletonButton = forwardRef<HTMLDivElement, SkeletonButtonProps>(
  ({ size = "md", fullWidth = false, className = "", ...props }, ref) => {
    const sizeClasses = {
      sm: "h-8 w-20",
      md: "h-10 w-28",
      lg: "h-12 w-36",
      xl: "h-14 w-44",
    };

    return (
      <div
        ref={ref}
        className={`skeleton-shimmer rounded-xl ${sizeClasses[size]} ${
          fullWidth ? "!w-full" : ""
        } ${className}`}
        aria-hidden="true"
        {...props}
      />
    );
  },
);
SkeletonButton.displayName = "SkeletonButton";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON CARD
// Premium glass card loading state
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "compact" | "featured";
  showAvatar?: boolean;
  showImage?: boolean;
}

export const SkeletonCard = forwardRef<HTMLDivElement, SkeletonCardProps>(
  (
    {
      variant = "default",
      showAvatar = false,
      showImage = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    const variantClasses = {
      default: "p-4 sm:p-6",
      compact: "p-3 sm:p-4",
      featured: "p-6 sm:p-8",
    };

    return (
      <div
        ref={ref}
        className={`glass rounded-2xl ${variantClasses[variant]} ${className}`}
        style={{
          boxShadow:
            "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)",
        }}
        {...props}
      >
        {showImage && (
          <div className="skeleton-shimmer w-full h-32 sm:h-40 rounded-xl mb-4" />
        )}

        <div className="flex items-start gap-3 sm:gap-4">
          {showAvatar && (
            <div className="skeleton-shimmer w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <div className="skeleton-shimmer h-5 sm:h-6 w-2/3 rounded-lg mb-3" />
            <div className="skeleton-shimmer h-3 sm:h-4 w-full rounded-lg mb-2" />
            <div className="skeleton-shimmer h-3 sm:h-4 w-3/4 rounded-lg" />
          </div>
        </div>

        {variant === "featured" && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <div className="skeleton-shimmer h-10 sm:h-12 w-full rounded-xl" />
          </div>
        )}
      </div>
    );
  },
);
SkeletonCard.displayName = "SkeletonCard";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON TRANSLATION OUTPUT
// Specific skeleton for translation result areas
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonTranslationProps extends HTMLAttributes<HTMLDivElement> {
  showVerification?: boolean;
}

export const SkeletonTranslation = forwardRef<
  HTMLDivElement,
  SkeletonTranslationProps
>(({ showVerification = false, className = "", ...props }, ref) => {
  return (
    <div ref={ref} className={`space-y-3 sm:space-y-4 ${className}`} {...props}>
      {/* Translation label */}
      <div className="flex items-center gap-2">
        <div className="skeleton-shimmer w-6 h-6 rounded-full" />
        <div className="skeleton-shimmer h-4 w-20 rounded-lg" />
      </div>

      {/* Translation result card */}
      <div
        className="glass rounded-2xl p-3 sm:p-4"
        style={{
          boxShadow:
            "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)",
        }}
      >
        <div className="skeleton-shimmer h-5 w-full rounded-lg mb-2" />
        <div className="skeleton-shimmer h-5 w-4/5 rounded-lg" />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
        <div className="skeleton-shimmer h-12 w-12 rounded-xl" />
      </div>

      {/* Verification section */}
      {showVerification && (
        <>
          <div className="flex items-center gap-2">
            <div className="skeleton-shimmer w-5 h-5 rounded-full" />
            <div className="skeleton-shimmer h-4 w-16 rounded-lg" />
          </div>
          <div
            className="glass rounded-2xl p-3 sm:p-4"
            style={{
              boxShadow:
                "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)",
            }}
          >
            <div className="skeleton-shimmer h-3 w-24 rounded-lg mb-2" />
            <div className="skeleton-shimmer h-5 w-full rounded-lg" />
          </div>
        </>
      )}
    </div>
  );
});
SkeletonTranslation.displayName = "SkeletonTranslation";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LANGUAGE SELECTOR
// Loading state for language selection UI
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonLanguageSelectorProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "dual" | "grid" | "single";
}

export const SkeletonLanguageSelector = forwardRef<
  HTMLDivElement,
  SkeletonLanguageSelectorProps
>(({ variant = "dual", className = "", ...props }, ref) => {
  if (variant === "grid") {
    return (
      <div
        ref={ref}
        className={`grid grid-cols-3 sm:grid-cols-4 gap-2 ${className}`}
        {...props}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer h-16 sm:h-20 rounded-xl"
            style={{
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === "single") {
    return (
      <div
        ref={ref}
        className={`skeleton-shimmer h-12 rounded-xl ${className}`}
        {...props}
      />
    );
  }

  // Dual selector (default)
  return (
    <div
      ref={ref}
      className={`flex items-center gap-2 ${className}`}
      {...props}
    >
      <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
      <div className="skeleton-shimmer h-12 w-12 rounded-xl" />
      <div className="skeleton-shimmer h-12 flex-1 rounded-xl" />
    </div>
  );
});
SkeletonLanguageSelector.displayName = "SkeletonLanguageSelector";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON MODE TABS
// Loading state for pill tabs / mode switching
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonModeTabsProps extends HTMLAttributes<HTMLDivElement> {
  count?: number;
}

export const SkeletonModeTabs = forwardRef<
  HTMLDivElement,
  SkeletonModeTabsProps
>(({ count = 4, className = "", ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={`flex gap-1 p-1 rounded-2xl bg-white/[0.04] ${className}`}
      {...props}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer h-10 flex-1 rounded-xl"
          style={{
            animationDelay: `${i * 75}ms`,
          }}
        />
      ))}
    </div>
  );
});
SkeletonModeTabs.displayName = "SkeletonModeTabs";

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON PAGE LOADER
// Full page loading state with premium spinner
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonPageProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
  showBrand?: boolean;
}

export const SkeletonPage = forwardRef<HTMLDivElement, SkeletonPageProps>(
  (
    { message = "Loading...", showBrand = true, className = "", ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={`min-h-screen bg-void-DEFAULT flex items-center justify-center ${className}`}
        {...props}
      >
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
          <p className="text-white/60 text-base font-medium">{message}</p>

          {/* Subtle tagline */}
          {showBrand && (
            <p className="text-white/40 text-sm mt-1">
              Your Voice. Any Language. Instantly.
            </p>
          )}
        </div>
      </div>
    );
  },
);
SkeletonPage.displayName = "SkeletonPage";

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default Skeleton;
