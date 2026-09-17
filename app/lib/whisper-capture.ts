// ─────────────────────────────────────────────────────────────────────────────
// WHISPER CAPTURE — tap-to-talk speech recognition that does NOT depend on
// Apple's speech service. webkitSpeechRecognition can EXIST but not WORK
// (Siri/Dictation disabled — the default on App-Review devices → the
// "service-not-allowed" error notification Apple hit). This records the mic
// and transcribes via our own /api/transcribe (OpenAI Whisper) instead.
// Used as the automatic fallback on the home translator and Face-to-Face.
// ─────────────────────────────────────────────────────────────────────────────

export interface WhisperCaptureHandle {
  stop: () => void; // finalize: stops recording and triggers transcription
  cancel: () => void; // abort without transcribing
}

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function whisperAvailable(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

// Start capturing. Resolves with a handle; onFinal fires with the transcript
// after stop(). Max 30s per utterance (auto-stops).
export async function startWhisperCapture(opts: {
  lang: string;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}): Promise<WhisperCaptureHandle | null> {
  if (!whisperAvailable()) {
    opts.onError("Voice input isn't available on this device.");
    return null;
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    opts.onError("Microphone access is needed for voice input.");
    return null;
  }

  const mime = pickMime();
  let mr: MediaRecorder;
  try {
    mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    opts.onError("Voice input isn't available on this device.");
    return null;
  }

  const chunks: Blob[] = [];
  let cancelled = false;
  mr.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mr.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    if (cancelled) return;
    const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
    if (blob.size < 1200) return; // too short — no speech
    try {
      const form = new FormData();
      form.append("audio", blob);
      form.append("language", opts.lang);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok) {
        opts.onError("Couldn't transcribe — check your connection and try again.");
        return;
      }
      const data = await res.json();
      const text = (data.text ?? "").trim();
      if (text && !data.dropped) opts.onFinal(text);
    } catch {
      opts.onError("Couldn't transcribe — check your connection and try again.");
    }
  };

  mr.start();
  const safety = setTimeout(() => {
    if (mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
  }, 30000);

  return {
    stop: () => {
      clearTimeout(safety);
      if (mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
    },
    cancel: () => {
      cancelled = true;
      clearTimeout(safety);
      if (mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

// True when a Web Speech error means "the service will never work this
// session" and the caller should switch to whisper capture.
export function isFatalSpeechError(err: string): boolean {
  return err === "service-not-allowed" || err === "language-not-supported";
}
