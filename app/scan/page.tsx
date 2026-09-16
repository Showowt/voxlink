"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { BackButton } from "@/app/components/ui/BackButton";

// ─────────────────────────────────────────────────────────────────────────────
// IN-APP QR SCANNER
// Scanning a code with the phone camera opens /add in Safari (a different
// storage context / device id), so the contact saves under the wrong owner and
// never appears in the app. Scanning HERE runs in the app's own WebView, so the
// resulting /add navigation saves the contact under the real app device id.
// ─────────────────────────────────────────────────────────────────────────────

type ScanState = "starting" | "scanning" | "denied" | "unavailable" | "found";

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const [state, setState] = useState<ScanState>("starting");
  const [hint, setHint] = useState("");

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const handleDecoded = (data: string) => {
      if (handledRef.current) return;
      // Our QR encodes an absolute /add?d=...&n=&l=&c= URL. Accept only that and
      // navigate to a LOCAL /add so the save happens in this app's context.
      try {
        const url = new URL(data.trim());
        const path = url.pathname.replace(/\/+$/, "");
        if (path.endsWith("/add") && url.searchParams.get("d")) {
          handledRef.current = true;
          setState("found");
          stop();
          router.push(`/add${url.search}`);
          return;
        }
      } catch {
        /* not a URL — fall through */
      }
      setHint("That doesn't look like an Entrevoz code — point at their QR.");
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Downscale for fast decode.
      const w = 360;
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
      if (code?.data) {
        handleDecoded(code.data);
        if (handledRef.current) return; // stop looping once routed
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => {});
        }
        setState("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        const name = (err as { name?: string })?.name || "";
        setState(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "unavailable",
        );
      }
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [router]);

  return (
    <div className="min-h-[100dvh] bg-[#06060a] text-white flex flex-col safe-top safe-bottom">
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <BackButton href="/dial" label="Dial" />
        <h1 className="text-sm font-semibold tracking-tight">Scan a code</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {state === "denied" ? (
          <>
            <div className="text-4xl mb-4">📷</div>
            <p className="text-white font-semibold mb-1">Camera access needed</p>
            <p className="text-white/40 text-sm mb-6">
              Allow camera access to scan a code, or enter it by hand.
            </p>
            <button
              onClick={() => router.push("/dial")}
              className="px-5 py-3 rounded-xl bg-[#00E5A0] text-black text-sm font-bold min-h-[48px]"
            >
              Enter a code instead
            </button>
          </>
        ) : state === "unavailable" ? (
          <>
            <div className="text-4xl mb-4">🚫</div>
            <p className="text-white font-semibold mb-1">Camera unavailable</p>
            <p className="text-white/40 text-sm mb-6">
              This device can&apos;t scan here — enter the code by hand.
            </p>
            <button
              onClick={() => router.push("/dial")}
              className="px-5 py-3 rounded-xl bg-[#00E5A0] text-black text-sm font-bold min-h-[48px]"
            >
              Enter a code instead
            </button>
          </>
        ) : (
          <>
            <div className="relative w-full max-w-xs aspect-square rounded-3xl overflow-hidden bg-black/40 border border-white/10">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                muted
                playsInline
              />
              {/* Scan reticle */}
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-[#00E5A0]/70" />
            </div>
            <p className="mt-6 text-sm text-white/60">
              {state === "found"
                ? "Got it — adding contact…"
                : "Point at your friend's Entrevoz QR"}
            </p>
            {hint && <p className="mt-2 text-xs text-amber-400/80">{hint}</p>}
            <button
              onClick={() => router.push("/dial")}
              className="mt-6 text-white/45 text-sm font-medium hover:text-white/70 transition-colors min-h-[44px]"
            >
              Enter a code instead
            </button>
          </>
        )}
      </div>

      {/* Offscreen decode target */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
