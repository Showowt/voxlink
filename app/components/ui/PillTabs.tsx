"use client";

import { type FC, type ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// PILL TABS - Premium tab navigation with pill indicator
// Features: animated pill, glow on active, smooth transitions
// ═══════════════════════════════════════════════════════════════════════════════

interface Tab {
  id: string;
  label: string | ReactNode;
  icon?: ReactNode;
  color?: string;
}

interface PillTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "default" | "compact" | "full";
  className?: string;
}

const PillTabs: FC<PillTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = "default",
  className = "",
}) => {
  // Variant styles - responsive padding for small screens
  const containerStyles = {
    default: "p-1 sm:p-1.5 gap-0.5 sm:gap-1",
    compact: "p-0.5 sm:p-1 gap-0.5",
    full: "p-1.5 sm:p-2 gap-1 sm:gap-2",
  };

  // Responsive tab sizes - smaller on mobile to prevent overflow
  const tabStyles = {
    default: "px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm",
    compact: "px-1.5 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs",
    full: "px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base",
  };

  return (
    <div
      className={`
        relative flex items-center overflow-x-auto scrollbar-hide
        bg-white/[0.04] backdrop-blur-md
        border border-white/[0.08]
        rounded-xl sm:rounded-2xl
        ${containerStyles[variant]}
        ${className}
      `}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const activeColor = tab.color || "voxxo";

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            aria-label={`Switch to ${typeof tab.label === "string" ? tab.label : tab.id} mode`}
            aria-current={isActive ? "page" : undefined}
            data-haptic={isActive ? "selection" : "impact-light"}
            data-touch-feedback="true"
            className={`
              relative flex-1 flex items-center justify-center gap-1 sm:gap-1.5
              rounded-lg sm:rounded-xl font-medium
              transition-all duration-150 ease-out
              active:scale-[0.97] active:opacity-90
              focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent
              select-none
              min-w-0 shrink-0
              ${tabStyles[variant]}
              ${
                isActive
                  ? `text-white bg-gradient-to-r from-${activeColor}-500/20 to-${activeColor}-600/10 border border-${activeColor}-500/30`
                  : "text-white/70 hover:text-white/90 hover:bg-white/[0.06]"
              }
            `}
            style={{
              ...(isActive
                ? { boxShadow: `0 0 20px rgba(0, 229, 160, 0.15)` }
                : {}),
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span className={isActive ? "font-semibold" : ""}>{tab.label}</span>

            {/* Active indicator dot */}
            {isActive && (
              <span
                className={`
                  absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2
                  w-1 h-1 rounded-full bg-${activeColor}-400
                  shadow-lg shadow-${activeColor}-400/50
                `}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

// Simple variant for compact use
interface SimplePillTabsProps {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const SimplePillTabs: FC<SimplePillTabsProps> = ({
  options,
  value,
  onChange,
  className = "",
}) => {
  return (
    <div
      className={`
        inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1
        bg-white/[0.06] backdrop-blur-sm
        border border-white/[0.10]
        rounded-lg sm:rounded-xl
        ${className}
      `}
    >
      {options.map((option) => {
        const isActive = option.id === value;

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            aria-label={option.label}
            aria-current={isActive ? "page" : undefined}
            data-haptic={isActive ? "selection" : "impact-light"}
            data-touch-feedback="true"
            className={`
              px-3 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium
              transition-all duration-150 ease-out min-h-[36px] sm:min-h-[40px]
              active:scale-[0.97] active:opacity-90
              focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50
              select-none
              ${
                isActive
                  ? "bg-voxxo-500 text-void-DEFAULT shadow-btn-primary"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              }
            `}
            style={{
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default PillTabs;
export { PillTabs, SimplePillTabs };
