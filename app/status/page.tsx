"use client";

import { useEffect, useState } from "react";
import "@/app/lib/admin-theme.css";

interface ServiceStatus {
  status: "ok" | "error" | "degraded";
  latency?: number;
  error?: string;
}

interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  responseTime: string;
  version: string;
  uptime: number;
  summary: {
    ok: number;
    total: number;
    translationAvailable: boolean;
    videoCallAvailable: boolean;
  };
  services: Record<string, ServiceStatus>;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      setHealth(data);
      setError(null);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Apple system semantic color for a status
  const sysColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "ok":
        return "var(--sys-green)";
      case "degraded":
        return "var(--sys-yellow)";
      default:
        return "var(--sys-red)";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "healthy":
        return "All Systems Operational";
      case "degraded":
        return "Partial System Outage";
      default:
        return "Major System Outage";
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const serviceLabels: Record<string, { name: string; description: string }> = {
    mymemory: { name: "MyMemory", description: "Primary translation API" },
    libretranslate: {
      name: "LibreTranslate",
      description: "Backup translation API",
    },
    lingva: { name: "Lingva", description: "Google Translate proxy" },
    google: { name: "Google Translate", description: "Fallback translation" },
    peerjs: { name: "PeerJS", description: "Video call signaling" },
    stun: { name: "STUN/TURN", description: "WebRTC connectivity" },
  };

  return (
    <div className="apple-admin safe-top safe-bottom">
      {/* Frosted navigation */}
      <header className="aa-nav">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[11px] flex items-center justify-center font-bold text-base"
              style={{
                background: "linear-gradient(135deg, var(--sys-blue), var(--sys-indigo))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 14px rgba(10,132,255,0.35)",
              }}
            >
              E
            </div>
            <div>
              <div className="font-semibold text-[15px]">Entrevoz System</div>
              <div className="aa-kicker" style={{ letterSpacing: "0.06em" }}>
                Live Status
              </div>
            </div>
          </div>
          {health && (
            <div className="text-right">
              <div className="text-[13px]" style={{ color: "var(--label-2)" }}>
                v{health.version}
              </div>
              <div className="text-[12px]" style={{ color: "var(--label-3)" }}>
                {formatUptime(health.uptime)} uptime
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div
              className="w-7 h-7 rounded-full animate-spin"
              style={{ border: "2.5px solid var(--hairline)", borderTopColor: "var(--sys-blue)" }}
            />
          </div>
        ) : error ? (
          <div className="aa-panel p-7 text-center aa-rise">
            <div className="text-lg font-semibold" style={{ color: "var(--sys-red)" }}>
              Unable to fetch status
            </div>
            <div className="mt-2 text-sm" style={{ color: "var(--label-2)" }}>
              {error}
            </div>
            <button
              onClick={fetchHealth}
              className="aa-press mt-5 px-5 py-2.5 rounded-full font-semibold text-sm text-white"
              style={{ background: "var(--sys-red)" }}
            >
              Retry
            </button>
          </div>
        ) : health ? (
          <>
            {/* Hero status */}
            <div className="aa-hero aa-rise" style={{ animationDelay: "0ms" }}>
              <div className="flex items-center gap-4">
                <div className="aa-dot" style={{ color: sysColor(health.status), background: sysColor(health.status), width: 16, height: 16 }} />
                <div>
                  <div className="aa-title">{getStatusText(health.status)}</div>
                  <div className="mt-1.5 text-[15px]" style={{ color: "var(--label-2)" }}>
                    {health.summary.ok} of {health.summary.total} services operational
                  </div>
                </div>
              </div>
            </div>

            {/* Feature tiles */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { icon: "🌐", name: "Translation", ok: health.summary.translationAvailable, delay: 60 },
                { icon: "📹", name: "Video Calls", ok: health.summary.videoCallAvailable, delay: 120 },
              ].map((f) => (
                <div key={f.name} className="aa-panel aa-rise p-5" style={{ animationDelay: `${f.delay}ms` }}>
                  <div className="text-2xl">{f.icon}</div>
                  <div className="mt-3 font-semibold text-[15px]">{f.name}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="aa-dot"
                      style={{ width: 8, height: 8, color: f.ok ? "var(--sys-green)" : "var(--sys-red)", background: f.ok ? "var(--sys-green)" : "var(--sys-red)" }}
                    />
                    <span className="text-[13px] font-medium" style={{ color: f.ok ? "var(--sys-green)" : "var(--sys-red)" }}>
                      {f.ok ? "Operational" : "Down"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Services — grouped inset list */}
            <div className="aa-kicker mt-8 mb-2.5 px-1">Services</div>
            <div className="aa-list aa-rise" style={{ animationDelay: "180ms" }}>
              {Object.entries(health.services).map(([key, service]) => {
                const label = serviceLabels[key] || { name: key, description: "" };
                return (
                  <div key={key} className="aa-row">
                    <div className="flex items-center gap-3">
                      <span
                        className="aa-dot"
                        style={{ width: 9, height: 9, color: sysColor(service.status), background: sysColor(service.status) }}
                      />
                      <div>
                        <div className="font-medium text-[15px]">{label.name}</div>
                        <div className="text-[12px]" style={{ color: "var(--label-3)" }}>
                          {label.description}
                        </div>
                      </div>
                    </div>
                    <div
                      className="text-[13px] font-medium tabular-nums"
                      style={{ color: service.status === "ok" ? "var(--label-2)" : "var(--sys-red)" }}
                    >
                      {service.status === "ok" ? `${service.latency} ms` : service.error || "Error"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 text-center text-[12px]" style={{ color: "var(--label-3)" }}>
              Updated {lastChecked?.toLocaleTimeString()} · auto-refreshes every 30s · {health.responseTime}
            </div>
          </>
        ) : null}
      </main>

      <footer className="max-w-3xl mx-auto px-5 py-8 text-center text-[13px]" style={{ color: "var(--label-3)" }}>
        <a href="/" style={{ color: "var(--sys-blue)" }} className="hover:opacity-80">
          Entrevoz
        </a>
        <span className="mx-3 opacity-40">·</span>
        <a href="/api/health" className="hover:opacity-80" style={{ color: "var(--label-2)" }}>
          API
        </a>
      </footer>
    </div>
  );
}
