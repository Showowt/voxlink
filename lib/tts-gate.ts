// ─── TTS speaking gate ────────────────────────────────────────────────────────
// Shared signal so the transcription hook can gate the mic (half-duplex) while
// our own translated audio (browser TTS) plays back — prevents the mic from
// re-transcribing our output ("translating things that were not said").

let listeners: Array<(v: boolean) => void> = [];

export function setTtsSpeaking(v: boolean): void {
  listeners.forEach((fn) => fn(v));
}

export function subscribeTtsSpeaking(fn: (v: boolean) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}
