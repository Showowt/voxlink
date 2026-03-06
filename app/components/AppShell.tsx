"use client";

import { useEffect, useState, ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";
import AccessGate, { STORAGE_KEY } from "./AccessGate";

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL - Wraps entire app with error handling and self-healing
// ═══════════════════════════════════════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  useEffect(() => {
    let healthInterval: NodeJS.Timeout | null = null;

    // Initialize self-healing system
    import("../lib/self-healing")
      .then(({ selfHealing }) => {
        if (selfHealing) {
          console.log("🛡️ Self-healing system active");

          // Log health status periodically
          healthInterval = setInterval(() => {
            try {
              const status = selfHealing.getHealthStatus();
              if (!status.healthy) {
                console.warn("🟡 Health issues:", status.issues);
              }
            } catch (err) {
              console.error("Health check failed:", err);
            }
          }, 60000); // Every minute
        }
      })
      .catch((err) => {
        console.error("Failed to load self-healing:", err);
      });

    return () => {
      if (healthInterval) clearInterval(healthInterval);
    };

    // Listen for recovery events
    const handleReconnect = () => {
      console.log("🔄 Reconnection triggered");
    };

    const handleHardRecovery = () => {
      console.log("🔄 Hard recovery triggered - reloading...");
      setTimeout(() => window.location.reload(), 1000);
    };

    const handleNetworkRestored = () => {
      console.log("🌐 Network restored");
    };

    window.addEventListener("voxlink-reconnect", handleReconnect);
    window.addEventListener("voxlink-hard-recovery", handleHardRecovery);
    window.addEventListener("voxlink-network-restored", handleNetworkRestored);

    return () => {
      window.removeEventListener("voxlink-reconnect", handleReconnect);
      window.removeEventListener("voxlink-hard-recovery", handleHardRecovery);
      window.removeEventListener(
        "voxlink-network-restored",
        handleNetworkRestored,
      );
    };
  }, []);

  return (
    <ErrorBoundary>
      <AccessGate>
        <OfflineIndicator />
        <LogoutButton />
        {children}
      </AccessGate>
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGOUT BUTTON - Sign out and clear auth token
// ═══════════════════════════════════════════════════════════════════════════════

function LogoutButton() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem(STORAGE_KEY);
    setIsAuthenticated(token !== null && token.length === 64);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  // Only show when authenticated
  if (!isAuthenticated) return null;

  return (
    <button
      onClick={handleLogout}
      className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-400 hover:text-white bg-[#1a1a2e] hover:bg-[#252538] border border-gray-700 hover:border-gray-600 rounded-lg transition-all"
      title="Sign Out"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        />
      </svg>
      <span className="hidden sm:inline">Sign Out</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OFFLINE INDICATOR - Shows when network is lost
// ═══════════════════════════════════════════════════════════════════════════════

function OfflineIndicator() {
  useEffect(() => {
    let offlineBanner: HTMLDivElement | null = null;

    const showOffline = () => {
      if (offlineBanner) return;

      offlineBanner = document.createElement("div");
      offlineBanner.id = "voxlink-offline-banner";
      offlineBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(90deg, #f59e0b, #d97706);
        color: white;
        text-align: center;
        padding: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        animation: slideDown 0.3s ease;
      `;
      offlineBanner.textContent =
        "📡 You're offline. Some features may be limited.";
      document.body.prepend(offlineBanner);
    };

    const hideOffline = () => {
      if (offlineBanner) {
        offlineBanner.remove();
        offlineBanner = null;
      }
    };

    // Initial check
    if (!navigator.onLine) {
      showOffline();
    }

    window.addEventListener("online", hideOffline);
    window.addEventListener("offline", showOffline);

    return () => {
      window.removeEventListener("online", hideOffline);
      window.removeEventListener("offline", showOffline);
      hideOffline();
    };
  }, []);

  return null;
}
