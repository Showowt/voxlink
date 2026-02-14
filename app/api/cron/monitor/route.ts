import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════════════════════════
// UPTIME MONITOR - Runs every 5 minutes via Vercel Cron
// Checks health and sends alerts if services go down
// ═══════════════════════════════════════════════════════════════════════════════

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  summary: {
    ok: number;
    total: number;
    translationAvailable: boolean;
    videoCallAvailable: boolean;
  };
  services: Record<
    string,
    { status: string; latency?: number; error?: string }
  >;
}

// Alert configuration - set these in Vercel Environment Variables
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL; // Discord/Slack webhook
const ALERT_EMAIL = process.env.ALERT_EMAIL; // For future email alerts
const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://voxlink-v14.vercel.app";

// Track previous state to avoid duplicate alerts
let lastStatus: string | null = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN = 15 * 60 * 1000; // 15 minutes between alerts

async function sendDiscordAlert(message: string, isRecovery: boolean = false) {
  if (!ALERT_WEBHOOK_URL) return;

  const color = isRecovery ? 0x00ff00 : 0xff0000; // Green for recovery, red for down
  const emoji = isRecovery ? "✅" : "🚨";

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `${emoji} VoxLink Status Alert`,
            description: message,
            color: color,
            timestamp: new Date().toISOString(),
            footer: { text: "VoxLink Uptime Monitor" },
          },
        ],
      }),
    });
  } catch (err) {
    console.error("Failed to send Discord alert:", err);
  }
}

async function sendSlackAlert(message: string, isRecovery: boolean = false) {
  if (!ALERT_WEBHOOK_URL) return;

  const emoji = isRecovery ? ":white_check_mark:" : ":rotating_light:";

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${emoji} *VoxLink Status Alert*\n${message}`,
        attachments: [
          {
            color: isRecovery ? "good" : "danger",
            footer: "VoxLink Uptime Monitor",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      }),
    });
  } catch (err) {
    console.error("Failed to send Slack alert:", err);
  }
}

async function sendAlert(health: HealthResponse, isRecovery: boolean = false) {
  const now = Date.now();

  // Check cooldown to avoid alert spam
  if (!isRecovery && now - lastAlertTime < ALERT_COOLDOWN) {
    console.log("Alert cooldown active, skipping...");
    return;
  }

  lastAlertTime = now;

  const downServices = Object.entries(health.services)
    .filter(([, s]) => s.status !== "ok")
    .map(([name, s]) => `• ${name}: ${s.error || "down"}`)
    .join("\n");

  const upServices = Object.entries(health.services)
    .filter(([, s]) => s.status === "ok")
    .map(([name, s]) => `• ${name}: ${s.latency}ms`)
    .join("\n");

  let message: string;

  if (isRecovery) {
    message = `**All services recovered!**\n\n**Status:** ${health.status}\n**Services:** ${health.summary.ok}/${health.summary.total} online\n\n${upServices}`;
  } else {
    message = `**Services are down!**\n\n**Status:** ${health.status}\n**Translation:** ${health.summary.translationAvailable ? "✅" : "❌"}\n**Video Calls:** ${health.summary.videoCallAvailable ? "✅" : "❌"}\n\n**Down:**\n${downServices}\n\n**Up:**\n${upServices}`;
  }

  // Detect webhook type and send appropriate format
  if (ALERT_WEBHOOK_URL?.includes("discord")) {
    await sendDiscordAlert(message, isRecovery);
  } else if (
    ALERT_WEBHOOK_URL?.includes("slack") ||
    ALERT_WEBHOOK_URL?.includes("hooks.slack")
  ) {
    await sendSlackAlert(message, isRecovery);
  } else if (ALERT_WEBHOOK_URL) {
    // Generic webhook
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: health.status,
        message,
        timestamp: new Date().toISOString(),
        isRecovery,
      }),
    });
  }
}

export async function GET(request: Request) {
  // Verify cron secret (REQUIRED for security)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch health status
    const healthRes = await fetch(`${SITE_URL}/api/health`, {
      signal: AbortSignal.timeout(25000),
    });

    if (!healthRes.ok) {
      throw new Error(`Health check failed: ${healthRes.status}`);
    }

    const health: HealthResponse = await healthRes.json();

    // Check if status changed
    const currentStatus = health.status;
    const statusChanged = lastStatus !== null && lastStatus !== currentStatus;

    // Send alerts on status change
    if (statusChanged) {
      if (currentStatus === "healthy" && lastStatus !== "healthy") {
        // Recovery
        await sendAlert(health, true);
        console.log("✅ Recovery alert sent");
      } else if (currentStatus !== "healthy" && lastStatus === "healthy") {
        // New incident
        await sendAlert(health, false);
        console.log("🚨 Incident alert sent");
      }
    } else if (currentStatus !== "healthy") {
      // Still down, send periodic reminder (respects cooldown)
      await sendAlert(health, false);
    }

    lastStatus = currentStatus;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      status: health.status,
      summary: health.summary,
      alertsEnabled: !!ALERT_WEBHOOK_URL,
      statusChanged,
    });
  } catch (error) {
    console.error("Monitor error:", error);

    // Try to send alert about complete failure
    if (ALERT_WEBHOOK_URL) {
      try {
        await fetch(ALERT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: "🚨 VoxLink Monitor CRITICAL: Health check completely failed!",
            embeds: [
              {
                title: "🚨 CRITICAL: Monitor Failed",
                description: `Health check endpoint unreachable.\nError: ${error instanceof Error ? error.message : "Unknown"}`,
                color: 0xff0000,
              },
            ],
          }),
        });
      } catch {}
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Monitor failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
