// Robust ElevenLabs MP3 playback. decodeAudioData rejects MP3 on iOS
// WKWebView/Safari, so persona voices were silently falling back to the
// robot voice — play through a persistent <audio> element instead (the
// same pattern the call dubbing uses). Resolves when playback finishes.
let sharedAudio: HTMLAudioElement | null = null;

export function playTtsBase64(base64: string): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));

  if (!sharedAudio) sharedAudio = new Audio();
  const audio = sharedAudio;
  audio.src = url;

  return new Promise<void>((resolve, reject) => {
    const done = (fail?: Error) => {
      URL.revokeObjectURL(url);
      audio.onended = null;
      audio.onerror = null;
      fail ? reject(fail) : resolve();
    };
    audio.onended = () => done();
    audio.onerror = () => done(new Error("audio playback error"));
    audio.play().catch((e) => done(e instanceof Error ? e : new Error("play() rejected")));
  });
}

export function stopTtsPlayback(): void {
  if (sharedAudio) {
    try {
      sharedAudio.pause();
      sharedAudio.src = "";
    } catch {
      /* ignore */
    }
  }
}
