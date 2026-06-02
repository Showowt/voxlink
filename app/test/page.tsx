"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ DEVICE DIAGNOSTIC - Pre-call readiness check
// Runs 8 tests to verify camera, mic, network, and API endpoints
// ═══════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TestStatus = "idle" | "running" | "pass" | "fail" | "warn";

interface TestResult {
  status: TestStatus;
  label: string;
  detail: string;
  latency?: number;
}

interface TestState {
  browser: TestResult;
  camera: TestResult;
  microphone: TestResult;
  stt: TestResult;
  translation: TestResult;
  turn: TestResult;
  daily: TestResult;
  network: TestResult;
}

const INITIAL: TestState = {
  browser: { status: "idle", label: "Browser Support", detail: "" },
  camera: { status: "idle", label: "Camera & Microphone", detail: "" },
  microphone: { status: "idle", label: "Microphone Level", detail: "" },
  stt: { status: "idle", label: "Speech Recognition", detail: "" },
  translation: { status: "idle", label: "Translation API", detail: "" },
  turn: { status: "idle", label: "TURN Servers", detail: "" },
  daily: { status: "idle", label: "Daily.co Room", detail: "" },
  network: { status: "idle", label: "Network Speed", detail: "" },
};

type TestKey = keyof TestState;

// ---------------------------------------------------------------------------
// Status icon component
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case "running":
      return (
        <div className="w-5 h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      );
    case "pass":
      return (
        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "fail":
      return (
        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "warn":
      return (
        <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3l9.66 16.59A1 1 0 0120.66 21H3.34a1 1 0 01-.86-1.41L12 3z" />
        </svg>
      );
    default:
      return (
        <div className="w-5 h-5 rounded-full border-2 border-white/20 flex-shrink-0" />
      );
  }
}

// ---------------------------------------------------------------------------
// Detect browser
// ---------------------------------------------------------------------------

function detectBrowser(): { name: string; version: string } {
  const ua = navigator.userAgent;
  let name = "Unknown";
  let version = "";

  if (ua.includes("Firefox/")) {
    name = "Firefox";
    version = ua.split("Firefox/")[1]?.split(" ")[0] ?? "";
  } else if (ua.includes("Edg/")) {
    name = "Edge";
    version = ua.split("Edg/")[1]?.split(" ")[0] ?? "";
  } else if (ua.includes("Chrome/")) {
    name = "Chrome";
    version = ua.split("Chrome/")[1]?.split(" ")[0] ?? "";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    name = "Safari";
    version = ua.split("Version/")[1]?.split(" ")[0] ?? "";
  }

  return { name, version };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TestPage() {
  const [tests, setTests] = useState<TestState>({ ...INITIAL });
  const [isRunning, setIsRunning] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup streams on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Update helper
  // ---------------------------------------------------------------------------

  const update = useCallback(
    (key: TestKey, partial: Partial<TestResult>) => {
      setTests((prev) => ({
        ...prev,
        [key]: { ...prev[key], ...partial },
      }));
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Individual test runners
  // ---------------------------------------------------------------------------

  const runBrowserTest = useCallback(async () => {
    update("browser", { status: "running", detail: "" });
    const { name, version } = detectBrowser();

    const hasMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices;
    const hasRTC = typeof RTCPeerConnection !== "undefined";
    const hasRecorder = typeof MediaRecorder !== "undefined";

    const missing: string[] = [];
    if (!hasMedia) missing.push("MediaDevices");
    if (!hasRTC) missing.push("RTCPeerConnection");
    if (!hasRecorder) missing.push("MediaRecorder");

    if (missing.length > 0) {
      update("browser", {
        status: "fail",
        detail: `${name} ${version} - Missing: ${missing.join(", ")}`,
      });
    } else {
      update("browser", {
        status: "pass",
        detail: `${name} ${version} - All APIs available`,
      });
    }
  }, [update]);

  const runCameraTest = useCallback(async () => {
    update("camera", { status: "running", detail: "Requesting permissions..." });

    // Stop any previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const settings = videoTrack?.getSettings();
      const width = settings?.width ?? 0;
      const height = settings?.height ?? 0;
      const audioOk = audioTrack?.readyState === "live";

      // Show preview briefly
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      update("camera", {
        status: "pass",
        detail: `${width}x${height} video, audio ${audioOk ? "active" : "inactive"}`,
      });

      // Stop tracks after 3 seconds to release hardware
      setTimeout(() => {
        stream.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        streamRef.current = null;
      }, 3000);
    } catch (err: unknown) {
      const message =
        err instanceof DOMException
          ? err.name === "NotAllowedError"
            ? "Permission denied - allow camera & mic access"
            : err.name === "NotFoundError"
              ? "No camera or microphone found"
              : err.message
          : "Camera access failed";
      update("camera", { status: "fail", detail: message });
    }
  }, [update]);

  const runMicrophoneTest = useCallback(async () => {
    update("microphone", { status: "running", detail: "Listening for 2 seconds..." });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let maxRms = 0;
      const startTime = Date.now();

      await new Promise<void>((resolve) => {
        const measure = () => {
          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          if (rms > maxRms) maxRms = rms;

          if (Date.now() - startTime < 2000) {
            requestAnimationFrame(measure);
          } else {
            resolve();
          }
        };
        measure();
      });

      stream.getTracks().forEach((t) => t.stop());
      await audioCtx.close();

      if (maxRms > 0.01) {
        update("microphone", {
          status: "pass",
          detail: `Mic is picking up audio (level: ${(maxRms * 100).toFixed(1)}%)`,
        });
      } else {
        update("microphone", {
          status: "fail",
          detail: "No audio detected - check mic or make some noise",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Microphone test failed";
      update("microphone", { status: "fail", detail: message });
    }
  }, [update]);

  const runSTTTest = useCallback(async () => {
    update("stt", { status: "running", detail: "" });

    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (SpeechRecognition) {
      update("stt", { status: "pass", detail: "Native STT available" });
    } else {
      update("stt", {
        status: "warn",
        detail: "Will use Whisper fallback (still works)",
      });
    }
  }, [update]);

  const runTranslationTest = useCallback(async () => {
    update("translation", { status: "running", detail: "Testing translation..." });

    const start = Date.now();
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello",
          sourceLang: "en",
          targetLang: "es",
        }),
      });

      const latency = Date.now() - start;
      if (!res.ok) {
        update("translation", {
          status: "fail",
          detail: `API returned ${res.status}`,
          latency,
        });
        return;
      }

      const data = await res.json();
      if (data.translation) {
        update("translation", {
          status: "pass",
          detail: `Hello → ${data.translation} (${latency}ms)`,
          latency,
        });
      } else {
        update("translation", {
          status: "fail",
          detail: data.error || "No translation in response",
          latency,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Translation API unreachable";
      update("translation", {
        status: "fail",
        detail: message,
        latency: Date.now() - start,
      });
    }
  }, [update]);

  const runTurnTest = useCallback(async () => {
    update("turn", { status: "running", detail: "Fetching TURN credentials..." });

    try {
      const res = await fetch("/api/turn");
      if (!res.ok) {
        update("turn", {
          status: "fail",
          detail: `TURN API returned ${res.status}`,
        });
        return;
      }

      const data = await res.json();
      const servers: Array<{ urls: string | string[] }> = data.iceServers ?? [];
      const turnCount = servers.filter((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => u.startsWith("turn:"));
      }).length;

      if (turnCount > 0) {
        update("turn", {
          status: "pass",
          detail: `${turnCount} TURN server${turnCount > 1 ? "s" : ""} available`,
        });
      } else {
        update("turn", {
          status: "warn",
          detail: "STUN only (may fail on restrictive networks/mobile)",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "TURN API unreachable";
      update("turn", { status: "fail", detail: message });
    }
  }, [update]);

  const runDailyTest = useCallback(async () => {
    update("daily", { status: "running", detail: "Creating test room..." });

    try {
      const res = await fetch("/api/daily/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: "TEST" }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        update("daily", {
          status: "fail",
          detail: (errData as Record<string, string>).error || `Daily API returned ${res.status}`,
        });
        return;
      }

      const data = await res.json();
      if (data.url) {
        update("daily", {
          status: "pass",
          detail: `Room created: ${data.url}`,
        });
      } else {
        update("daily", {
          status: "fail",
          detail: "No room URL in response",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Daily.co API unreachable";
      update("daily", { status: "fail", detail: message });
    }
  }, [update]);

  const runNetworkTest = useCallback(async () => {
    update("network", { status: "running", detail: "Measuring latency..." });

    const start = Date.now();
    try {
      const res = await fetch("/api/health");
      const latency = Date.now() - start;

      if (!res.ok) {
        update("network", {
          status: "fail",
          detail: `Health endpoint returned ${res.status}`,
          latency,
        });
        return;
      }

      let rating: string;
      let status: TestStatus;
      if (latency < 200) {
        rating = "Excellent";
        status = "pass";
      } else if (latency < 500) {
        rating = "Good";
        status = "pass";
      } else if (latency < 1000) {
        rating = "Fair";
        status = "warn";
      } else {
        rating = "Poor";
        status = "fail";
      }

      update("network", {
        status,
        detail: `${latency}ms - ${rating}`,
        latency,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network test failed";
      update("network", {
        status: "fail",
        detail: message,
        latency: Date.now() - start,
      });
    }
  }, [update]);

  // ---------------------------------------------------------------------------
  // Run all tests sequentially
  // ---------------------------------------------------------------------------

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    setShareMessage("");
    setTests({ ...INITIAL });

    const runners: Array<[TestKey, () => Promise<void>]> = [
      ["browser", runBrowserTest],
      ["camera", runCameraTest],
      ["microphone", runMicrophoneTest],
      ["stt", runSTTTest],
      ["translation", runTranslationTest],
      ["turn", runTurnTest],
      ["daily", runDailyTest],
      ["network", runNetworkTest],
    ];

    for (const [, runner] of runners) {
      await runner();
    }

    setIsRunning(false);
  }, [
    runBrowserTest,
    runCameraTest,
    runMicrophoneTest,
    runSTTTest,
    runTranslationTest,
    runTurnTest,
    runDailyTest,
    runNetworkTest,
  ]);

  // ---------------------------------------------------------------------------
  // Re-run single test
  // ---------------------------------------------------------------------------

  const reRunTest = useCallback(
    async (key: TestKey) => {
      const runners: Record<TestKey, () => Promise<void>> = {
        browser: runBrowserTest,
        camera: runCameraTest,
        microphone: runMicrophoneTest,
        stt: runSTTTest,
        translation: runTranslationTest,
        turn: runTurnTest,
        daily: runDailyTest,
        network: runNetworkTest,
      };
      await runners[key]();
    },
    [
      runBrowserTest,
      runCameraTest,
      runMicrophoneTest,
      runSTTTest,
      runTranslationTest,
      runTurnTest,
      runDailyTest,
      runNetworkTest,
    ],
  );

  // ---------------------------------------------------------------------------
  // Share results
  // ---------------------------------------------------------------------------

  const shareResults = useCallback(async () => {
    const lines = Object.entries(tests).map(([, t]) => {
      const icon =
        t.status === "pass"
          ? "[PASS]"
          : t.status === "fail"
            ? "[FAIL]"
            : t.status === "warn"
              ? "[WARN]"
              : "[----]";
      return `${icon} ${t.label}: ${t.detail || "Not tested"}`;
    });

    const text = [
      "Entrevoz Device Diagnostic",
      `Date: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      "",
      ...lines,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("Copied to clipboard");
      setTimeout(() => setShareMessage(""), 2500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setShareMessage("Copied to clipboard");
      setTimeout(() => setShareMessage(""), 2500);
    }
  }, [tests]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const allTests = Object.entries(tests) as Array<[TestKey, TestResult]>;
  const hasResults = allTests.some(([, t]) => t.status !== "idle");
  const anyFailed = allTests.some(([, t]) => t.status === "fail");
  const allPassed = hasResults && allTests.every(([, t]) => t.status === "pass" || t.status === "warn");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-[100dvh] bg-[#060810] text-white safe-top safe-bottom">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              aria-label="Back to home"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Device Test</h1>
              <p className="text-xs text-white/40">Pre-call readiness check</p>
            </div>
          </div>

          {/* Hidden video preview */}
          <video
            ref={videoRef}
            className="w-[100px] h-[75px] rounded-lg object-cover bg-black/50 border border-white/10"
            autoPlay
            playsInline
            muted
            style={{ transform: "scaleX(-1)" }}
          />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Run All button */}
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all duration-200 ${
            isRunning
              ? "bg-white/10 text-white/40 cursor-not-allowed"
              : "bg-gradient-to-r from-voxxo-500 to-voxxo-600 text-[#060810] hover:from-voxxo-400 hover:to-voxxo-500 shadow-lg shadow-voxxo-500/20 hover:-translate-y-0.5 active:scale-[0.98]"
          }`}
          aria-label={isRunning ? "Tests running" : "Run all diagnostic tests"}
        >
          {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
              Running...
            </span>
          ) : (
            "Run All Tests"
          )}
        </button>

        {/* Test cards */}
        <div className="space-y-2.5">
          {allTests.map(([key, test]) => (
            <div
              key={key}
              className={`rounded-xl border p-4 transition-all duration-200 ${
                test.status === "pass"
                  ? "bg-emerald-500/[0.04] border-emerald-500/20"
                  : test.status === "fail"
                    ? "bg-red-500/[0.04] border-red-500/20"
                    : test.status === "warn"
                      ? "bg-amber-500/[0.04] border-amber-500/20"
                      : "bg-[#12121a] border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-0.5">
                    <StatusIcon status={test.status} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{test.label}</div>
                    {test.detail && (
                      <p
                        className={`text-xs mt-1 break-words ${
                          test.status === "pass"
                            ? "text-emerald-400/80"
                            : test.status === "fail"
                              ? "text-red-400/80"
                              : test.status === "warn"
                                ? "text-amber-400/80"
                                : "text-white/50"
                        }`}
                      >
                        {test.detail}
                      </p>
                    )}
                  </div>
                </div>

                {/* Re-run button */}
                {test.status !== "idle" && test.status !== "running" && (
                  <button
                    onClick={() => reRunTest(key)}
                    className="flex-shrink-0 p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
                    aria-label={`Re-run ${test.label} test`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Overall result */}
        {hasResults && !isRunning && (
          <div
            className={`rounded-xl border p-4 text-center ${
              allPassed
                ? "bg-emerald-500/[0.06] border-emerald-500/20"
                : anyFailed
                  ? "bg-red-500/[0.06] border-red-500/20"
                  : "bg-amber-500/[0.06] border-amber-500/20"
            }`}
          >
            <div
              className={`text-base font-bold ${
                allPassed
                  ? "text-emerald-400"
                  : anyFailed
                    ? "text-red-400"
                    : "text-amber-400"
              }`}
            >
              {allPassed
                ? "Ready for calls"
                : anyFailed
                  ? "Issues found"
                  : "Partial issues"}
            </div>
            <p className="text-xs text-white/50 mt-1">
              {allPassed
                ? "All systems are operational. You can start a call."
                : anyFailed
                  ? "Some tests failed. Review the issues above before calling."
                  : "Some warnings detected. Calls may still work."}
            </p>
          </div>
        )}

        {/* Share Results button */}
        {hasResults && !isRunning && (
          <button
            onClick={shareResults}
            className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.04] text-white/70 text-sm font-medium hover:bg-white/[0.08] hover:text-white transition-all active:scale-[0.98]"
            aria-label="Copy diagnostic results to clipboard"
          >
            {shareMessage || "Share Results (Copy to Clipboard)"}
          </button>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-lg mx-auto px-4 py-5 text-center text-xs text-white/40">
          <a href="/" className="text-voxxo-500 hover:text-voxxo-400 transition">
            Back to Entrevoz
          </a>
          <span className="mx-2">·</span>
          <a href="/status" className="text-white/50 hover:text-white/70 transition">
            System Status
          </a>
        </div>
      </footer>
    </div>
  );
}
