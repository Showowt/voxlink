"use client";

import { useEffect, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import ErrorBoundary from "./ErrorBoundary";
import BottomNav from "./BottomNav";
import IncomingCallOverlay from "./IncomingCallOverlay";
import AIConsentSheet from "./AIConsentSheet";
import NotificationEnablePrompt from "./NotificationEnablePrompt";
import PhoneCapturePrompt from "./PhoneCapturePrompt";

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL - Wraps entire app with error handling and self-healing
// ═══════════════════════════════════════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Identity + lost-write recovery, as early as possible: reconcile the device
  // id across its three mirrors (localStorage / cookie / IndexedDB) so a
  // purged localStorage doesn't strand the user's contacts and history under
  // an orphaned id, then retry any queued contact/history writes that failed
  // on a previous session.
  useEffect(() => {
    // Build-stamp beacon: report which deploy each REAL device is running, so
    // "is this phone on the current code?" is answered from data, not guessed.
    try {
      const build = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev";
      if (sessionStorage.getItem("ev_build_beaconed") !== build) {
        sessionStorage.setItem("ev_build_beaconed", build);
        import("../lib/diag").then(({ diag }) =>
          diag("app-load", {
            build,
            sw:
              typeof navigator !== "undefined" &&
              "serviceWorker" in navigator &&
              !!navigator.serviceWorker.controller,
          }),
        );
      }
      // Foreground heartbeat: so I can SEE when a real device's app is actually
      // open/active (distinguishes "app not open" from "ring not arriving").
      // Throttled to once/30s.
      let lastFg = 0;
      const beaconFg = () => {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - lastFg < 30000) return;
        lastFg = Date.now();
        import("../lib/diag").then(({ diag }) => diag("foreground", { build })).catch(() => {});
      };
      beaconFg();
      document.addEventListener("visibilitychange", beaconFg);
      if (typeof navigator !== "undefined" && navigator.userAgent.includes("EntrevozApp")) {
        import("@capacitor/app")
          .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) beaconFg(); }))
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
    import("../lib/language-os/device-id")
      .then(({ ensureStableDeviceId }) => ensureStableDeviceId())
      // Once identity is stable, (re)register this browser's Web Push
      // subscription so a CLOSED/backgrounded web phone can be woken for calls.
      // Silent + idempotent: only acts if notification permission was already
      // granted (the first grant comes from the NotificationEnablePrompt button).
      .then(() =>
        import("../lib/web-push-client").then(({ ensureWebPushSubscribed }) =>
          ensureWebPushSubscribed(),
        ),
      )
      .catch(() => {});
    import("../lib/reliable-post")
      .then(({ installOutboxFlush }) => installOutboxFlush())
      .catch(() => {});

    // If the device id is recovered/changes mid-session, re-register the Web
    // Push subscription under the new id (the stored sub's device_id would
    // otherwise be stale and a caller dialing the new id wouldn't wake it).
    const onIdRestored = () => {
      import("../lib/web-push-client")
        .then(({ ensureWebPushSubscribed }) => ensureWebPushSubscribed())
        .catch(() => {});
    };
    window.addEventListener("entrevoz:device-id-restored", onIdRestored);
    return () => {
      window.removeEventListener("entrevoz:device-id-restored", onIdRestored);
    };
  }, []);

  // Native shell only: register the VoIP token + handle CallKit answers so the
  // device rings when closed. No-ops on the web.
  useEffect(() => {
    import("../lib/native-call")
      .then(({ initNativeRing }) => initNativeRing((p) => router.push(p)))
      .catch(() => {});
  }, [router]);

  // iOS shell: stop the webview drawing under the system status bar (content
  // was sliding beneath the clock/battery). The plugin ships in the app
  // binary; this call reaches it through the injected Capacitor bridge.
  // Also activates the fixed-shell scroller (see globals.css .native-shell):
  // the document never scrolls, so rubber-band sway is impossible.
  useEffect(() => {
    if (!navigator.userAgent.includes("EntrevozApp")) return;
    document.documentElement.classList.add("native-shell");
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  // With the inner scroller, Next's window-based scroll restoration is a
  // no-op — reset the scroller ourselves on every route change.
  useEffect(() => {
    document.getElementById("app-scroll")?.scrollTo(0, 0);
  }, [pathname]);

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

  // BottomNav is a fixed ~56px bar hidden on full-screen call routes. Give
  // the scroller matching bottom clearance on nav-visible routes so page
  // content/controls aren't hidden underneath it.
  const NAV_HIDDEN = ["/call/", "/talk/", "/group/", "/face-to-face", "/language-os/"];
  const navVisible = !NAV_HIDDEN.some((r) => pathname.startsWith(r));

  return (
    <ErrorBoundary>
      <OfflineIndicator />
      <div
        id="app-scroll"
        style={
          navVisible
            ? { paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom) + 0.5rem)" }
            : undefined
        }
      >
        {children}
      </div>
      <BottomNav />
      <IncomingCallOverlay />
      <NotificationEnablePrompt />
      <PhoneCapturePrompt />
      <AIConsentSheet />
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
