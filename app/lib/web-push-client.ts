"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// WEB PUSH (client) — register the push-only service worker and subscribe this
// browser so it can be WOKEN for an incoming call when the app is closed or
// backgrounded. Pairs with /api/push/web-subscribe (storage) and the caller-side
// send in /api/ring/send. Native shell (EntrevozApp) is skipped — it rings via
// VoIP/CallKit instead.
// ═══════════════════════════════════════════════════════════════════════════════

import { getDeviceId } from "@/app/lib/language-os/device-id";
import { deriveDialCode } from "@/app/lib/dial-code";

// Public VAPID key is NOT secret (it ships to every browser). Env override lets
// the key rotate without a code change; the literal keeps push working even if
// the NEXT_PUBLIC env isn't set on a given deploy.
const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BHJzB6CMF296XWtwo-GqdYw3MjACJP-G4wy1zoCnyzo2rB1HM0nwQ6-Q28q9XB4IqG-mG3b_1gt-N7hVwtODEWQ";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Build on an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>
  // (satisfies applicationServerKey's BufferSource; a plain Uint8Array infers
  // ArrayBufferLike which TS rejects).
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isNativeShell(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("EntrevozApp");
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator).maxTouchPoints > 1)
  );
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    !!window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isWebPushSupported()) return "unsupported";
  return Notification.permission;
}

let registering: Promise<ServiceWorkerRegistration | null> | null = null;
async function registerPushSW(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  if (registering) return registering;
  registering = (async () => {
    try {
      const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      return reg;
    } catch {
      return null;
    }
  })();
  return registering;
}

async function postSubscription(sub: PushSubscription, userId?: string): Promise<void> {
  try {
    const deviceId = getDeviceId();
    const dialCode = deriveDialCode(deviceId);
    await fetch("/api/push/web-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ deviceId, dialCode, userId, subscription: sub.toJSON() }),
    });
  } catch {
    /* ignore — retried on next load */
  }
}

// Idempotent + silent: if permission is already granted, ensure a subscription
// exists and is registered server-side. Safe to call on every app load. NEVER
// prompts (permission requests must come from a user gesture — see enableWebPush).
export async function ensureWebPushSubscribed(userId?: string): Promise<boolean> {
  if (!isWebPushSupported() || isNativeShell()) return false;
  if (Notification.permission !== "granted") return false;
  const reg = await registerPushSW();
  if (!reg) return false;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    await postSubscription(sub, userId);
    // Adoption beacon (once/session): so closed-app-wake coverage is measurable
    // from data (how many real devices actually have a live subscription) rather
    // than inferred. See diag_events step='web-push-subscribed'.
    try {
      if (sessionStorage.getItem("ev_webpush_beaconed") !== "1") {
        sessionStorage.setItem("ev_webpush_beaconed", "1");
        const { diag } = await import("@/app/lib/diag");
        void diag("web-push-subscribed", { standalone: isStandalonePWA() });
      }
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

// From a user gesture (the "Enable" button): request permission, then subscribe.
export async function enableWebPush(
  userId?: string,
): Promise<NotificationPermission | "unsupported"> {
  if (!isWebPushSupported() || isNativeShell()) return "unsupported";
  let perm: NotificationPermission = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted") await ensureWebPushSubscribed(userId);
  return perm;
}
