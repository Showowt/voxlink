// ═══════════════════════════════════════════════════════════════════════════════
// NATIVE CALL — bridge to the iOS PushKit/CallKit plugin (EntrevozCall.swift).
//
// In the native shell: registers the device's VoIP token so it can be rung when
// the app is CLOSED, and navigates into the room when the user answers the
// native CallKit screen. No-ops on the web (the plugin isn't present).
// ═══════════════════════════════════════════════════════════════════════════════

import { registerPlugin } from "@capacitor/core";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { deriveDialCode } from "@/app/lib/dial-code";
import type { CallInvite } from "@/app/lib/ring-signal";

interface EntrevozCallPlugin {
  getToken(): Promise<{ token: string }>;
  getPendingAnswered(): Promise<{ room?: string; type?: string; fromLang?: string }>;
  addListener(
    event: "voipToken" | "callAnswered" | "callDeclined",
    cb: (data: Record<string, string>) => void,
  ): Promise<{ remove: () => void }>;
}

function getPlugin(): EntrevozCallPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null; // web — no native ring
  try {
    return registerPlugin<EntrevozCallPlugin>("EntrevozCall");
  } catch {
    return null;
  }
}

// Register this device's VoIP token + wire "answered" → navigate. Call once,
// app-wide (AppShell). `navigate` is router.push.
export async function initNativeRing(navigate: (path: string) => void): Promise<void> {
  const p = getPlugin();
  if (!p) return;

  let deviceId = "";
  try {
    deviceId = getDeviceId();
  } catch {
    return;
  }
  const dialCode = deriveDialCode(deviceId);

  const register = (token: string) => {
    if (!token) return;
    fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, dialCode, token, platform: "ios" }),
    }).catch(() => {});
  };

  try {
    const { token } = await p.getToken();
    if (token) register(token);
  } catch {
    /* token not ready yet — the listener below will catch it */
  }
  p.addListener("voipToken", (d) => register(d?.token)).catch(() => {});

  const goToRoom = (d: Record<string, string>) => {
    if (!d?.room) return;
    const q =
      (d.fromLang ? `&hostLang=${d.fromLang}` : "") +
      (d.fromDevice ? `&pd=${encodeURIComponent(d.fromDevice)}` : "") +
      (d.fromName ? `&pn=${encodeURIComponent(d.fromName)}` : "");
    // Route by the INVITE's type — an answered AUDIO call must land on /talk,
    // not the video page (whose lobby demands the camera).
    const path = d.type === "audio" ? "/talk" : "/call";
    navigate(`${path}/${d.room}?host=false${q}`);
  };
  p.addListener("callAnswered", goToRoom).catch(() => {});

  // Declining on the native CallKit screen previously vanished — the caller
  // waited forever. Forward it as the standard declined signal.
  p.addListener("callDeclined", (d) => {
    if (!d?.fromDevice || !d?.room) return;
    import("@/app/lib/ring-signal")
      .then(({ sendCallSignal }) => sendCallSignal(d.fromDevice, "call-declined", d.room))
      .catch(() => {});
  }).catch(() => {});

  // If the app was cold-launched by answering the push, honor the pending call.
  try {
    const pending = await p.getPendingAnswered();
    if (pending?.room) goToRoom(pending as Record<string, string>);
  } catch {
    /* none */
  }
}

// Caller side: fire a VoIP push so a CLOSED device rings too (best-effort, runs
// in parallel with the in-app Realtime/PeerJS invite). `target` is the device
// id OR dial code the caller used.
export function sendVoipPush(
  target: string,
  invite: Omit<CallInvite, "t">,
): void {
  if (!target) return;
  fetch("/api/push/voip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target,
      room: invite.room,
      type: invite.type,
      fromName: invite.fromName,
      fromLang: invite.fromLang,
      fromDevice: invite.fromDevice,
    }),
  }).catch(() => {});
}
