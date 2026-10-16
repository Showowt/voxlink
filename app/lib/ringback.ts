// Outbound RINGBACK — the sound that tells a caller "their phone is ringing".
// Standard North-America ringback: 440Hz + 480Hz dual tone, 2s on / 4s off.
// Without it, dialing someone by code felt dead ("it's not connecting") even
// while the callee's phone was ringing fine.
//
// AudioContext may start suspended without a user gesture (iOS); we resume
// best-effort — the visual "Ringing…" state carries the feedback regardless.

let ctx: AudioContext | null = null;
let nodes: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
let pattern: ReturnType<typeof setInterval> | null = null;

export function startRingback(): void {
  if (pattern) return; // already ringing
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new AC();
    void ctx.resume().catch(() => {});
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc1 = ctx.createOscillator();
    osc1.frequency.value = 440;
    const osc2 = ctx.createOscillator();
    osc2.frequency.value = 480;
    osc1.connect(gain);
    osc2.connect(gain);
    osc1.start();
    osc2.start();
    nodes = { osc1, osc2, gain };
    const burst = () => {
      if (!ctx || !nodes) return;
      const t = ctx.currentTime;
      const g = nodes.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.1, t + 0.04);
      g.setValueAtTime(0.1, t + 1.95);
      g.exponentialRampToValueAtTime(0.0001, t + 2.0);
    };
    burst();
    pattern = setInterval(burst, 6000);
  } catch {
    /* audio blocked — visual ringing state still shows */
  }
}

export function stopRingback(): void {
  if (pattern) {
    clearInterval(pattern);
    pattern = null;
  }
  try {
    nodes?.osc1.stop();
    nodes?.osc2.stop();
    nodes?.gain.disconnect();
  } catch {
    /* already stopped */
  }
  nodes = null;
}
