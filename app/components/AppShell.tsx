"use client";

import { useEffect, ReactNode } from "react";
import ErrorBoundary from "./ErrorBoundary";
import BottomNav from "./BottomNav";

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL - Wraps entire app with error handling and self-healing
// ═══════════════════════════════════════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  // iOS shell: stop the webview drawing under the system status bar (content
  // was sliding beneath the clock/battery). The plugin ships in the app
  // binary; this call reaches it through the injected Capacitor bridge.
  useEffect(() => {
    if (!navigator.userAgent.includes("EntrevozApp")) return;
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let healthInterval: NodeJS.Timeout | null = null;

    // Initialize self-healing system
    import("../lib/self-healing")
      .then(({ selfHealing }) => {
        if (selfHealing) {
          // Self-healing system active

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
      // Reconnection triggered
    };

    const handleHardRecovery = () => {
      // Hard recovery triggered - reloading
      setTimeout(() => window.location.reload(), 1000);
    };

    const handleNetworkRestored = () => {
      // Network restored
    };

    window.addEventListener("entrevoz-reconnect", handleReconnect);
    window.addEventListener("entrevoz-hard-recovery", handleHardRecovery);
    window.addEventListener("entrevoz-network-restored", handleNetworkRestored);

    return () => {
      window.removeEventListener("entrevoz-reconnect", handleReconnect);
      window.removeEventListener("entrevoz-hard-recovery", handleHardRecovery);
      window.removeEventListener(
        "entrevoz-network-restored",
        handleNetworkRestored,
      );
    };
  }, []);

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      {children}
      <BottomNav />
    </ErrorBoundary>
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
      offlineBanner.id = "entrevoz-offline-banner";
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
