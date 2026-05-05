// Language OS TTS — bulletproof text-to-speech

export class LangTTS {
  private utterance: SpeechSynthesisUtterance | null = null;
  private locale: string;
  private resumeInterval: ReturnType<typeof setInterval> | null = null;

  constructor(locale: string) {
    this.locale = locale;
  }

  speak(text: string, opts?: { rate?: number; onEnd?: () => void }): void {
    window.speechSynthesis.cancel();
    this.clearResumeInterval();

    if (!text.trim()) return;

    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.lang = this.locale;
    this.utterance.rate = opts?.rate ?? 0.9;
    this.utterance.pitch = 1.0;
    this.utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const exactMatch = voices.find((v) => v.lang === this.locale);
    const langMatch = voices.find((v) => v.lang.startsWith(this.locale.split("-")[0]));
    const voice = exactMatch ?? langMatch ?? null;
    if (voice) this.utterance.voice = voice;

    // iOS Safari bug: speechSynthesis stops after ~15s
    this.resumeInterval = setInterval(() => {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 14000);

    this.utterance.onend = () => {
      this.clearResumeInterval();
      opts?.onEnd?.();
    };

    this.utterance.onerror = (e) => {
      this.clearResumeInterval();
      if (e.error !== "interrupted") {
        console.warn("[LangTTS] Speech error:", e.error);
      }
    };

    window.speechSynthesis.speak(this.utterance);
  }

  stop(): void {
    window.speechSynthesis.cancel();
    this.clearResumeInterval();
    this.utterance = null;
  }

  private clearResumeInterval(): void {
    if (this.resumeInterval) {
      clearInterval(this.resumeInterval);
      this.resumeInterval = null;
    }
  }

  static isAvailable(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  static async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      window.speechSynthesis.onvoiceschanged = () => {
        resolve(window.speechSynthesis.getVoices());
      };
      setTimeout(() => resolve([]), 3000);
    });
  }
}
