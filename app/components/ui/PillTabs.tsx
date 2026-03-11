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
  // Variant styles
  const containerStyles = {
    default: "p-1.5 gap-1",
    compact: "p-1 gap-0.5",
    full: "p-2 gap-2",
  };

  const tabStyles = {
    default: "px-4 py-2.5 text-sm",
    compact: "px-3 py-2 text-xs",
    full: "px-6 py-3 text-base",
  };

  return (
    <div
      className={`
        relative flex items-center
        bg-white/[0.04] backdrop-blur-md
        border border-white/[0.08]
        rounded-2xl
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
            className={`
              relative flex-1 flex items-center justify-center gap-1.5
              rounded-xl font-medium
              transition-all duration-200
              ${tabStyles[variant]}
              ${
                isActive
                  ? `text-white bg-gradient-to-r from-${activeColor}-500/20 to-${activeColor}-600/10 border border-${activeColor}-500/30`
                  : "text-white/50 hover:text-white/70 hover:bg-white/[0.04]"
              }
            `}
            style={
              isActive
                ? {
                    boxShadow: `0 0 20px rgba(0, 229, 160, 0.15)`,
                  }
                : undefined
            }
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
        inline-flex items-center gap-1 p-1
        bg-white/[0.06] backdrop-blur-sm
        border border-white/[0.10]
        rounded-xl
        ${className}
      `}
    >
      {options.map((option) => {
        const isActive = option.id === value;

        return (
          <button
            key={option.id}
            onClick={() => onChange(option.id)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium
              transition-all duration-200
              ${
                isActive
                  ? "bg-voxxo-500 text-void-DEFAULT shadow-btn-primary"
                  : "text-white/60 hover:text-white hover:bg-white/[0.06]"
              }
            `}
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
