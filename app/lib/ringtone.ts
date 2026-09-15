// ═══════════════════════════════════════════════════════════════════════════════
// RINGTONE — synthesized incoming-call ring + haptics (no audio asset).
//
// Plays a looping two-tone ring via Web Audio and buzzes the phone via Capacitor
// Haptics. In the native shell autoplay is unlocked (WKWebView
// mediaTypesRequiringUserActionForPlayback = []), so it rings without a gesture.
// Returns a stop() function. Auto-stops after ~35s so it never rings forever.
// ═══════════════════════════════════════════════════════════════════════════════

export function startRingtone(): () => void {
  if (typeof window === "undefined") return () => {};

  let stopped = false;
  let toneTimer: ReturnType<typeof setInterval> | null = null;
  let hapticTimer: ReturnType<typeof setInterval> | null = null;
  let safety: ReturnType<typeof setTimeout> | null = null;
  let ctx: AudioContext | null = null;

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) {
      ctx = new Ctor();
      ctx.resume?.().catch(() => {});
    }
  } catch {
    ctx = null;
  }

  // One "bring-bring" burst: two gentle tones with soft envelopes (no clicks).
  const burst = () => {
    if (stopped || !ctx) return;
    const now = ctx.currentTime;
    [587.33, 783.99].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.24;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.16, t0 + 0.03);
      gain.gain.setValueAtTime(0.16, t0 + 0.19);
      gain.gain.linearRampToValueAtTime(0, t0 + 0.23);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    });
  };

  const buzz = () => {
    import("@capacitor/haptics")
      .then(({ Haptics, ImpactStyle }) =>
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}),
      )
      .catch(() => {});
    // Web fallback (no-op on iOS Safari, works on Android web)
    try {
      navigator.vibrate?.([200, 120, 200]);
    } catch {
      /* ignore */
    }
  };

  burst();
  buzz();
  toneTimer = setInterval(burst, 1700);
  hapticTimer = setInterval(buzz, 1700);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (toneTimer) clearInterval(toneTimer);
    if (hapticTimer) clearInterval(hapticTimer);
    if (safety) clearTimeout(safety);
    try {
      ctx?.close();
    } catch {
      /* ignore */
    }
  };

  safety = setTimeout(stop, 35000);
  return stop;
}
