import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// APP-REVIEW FIXES E2E against production — reproduces the Apple rejection:
// A) service-not-allowed (Siri/Dictation off — the review device default):
//    a stubbed webkitSpeechRecognition fires it on start. PASS = NO error
//    notification, the mic stays "recording", and finishing the tap fires a
//    POST /api/transcribe (Whisper fallback) — on HOME and FACE-TO-FACE.
// B) AI consent (5.1.1): fresh device sees the consent sheet BEFORE any AI
//    use; Agree dismisses it; after "Not now", tapping the mic re-opens it.
// usage: node native/e2e-review-fixes-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://www.entrevoz.co";
const UA =
  "Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function newPage({ consent, stubSpeech }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1180, height: 820 }); // iPad Air 11
  await page.evaluateOnNewDocument(
    (c, stub) => {
      localStorage.setItem("los_device_id", "e2er0000-0000-4000-8000-000000000001");
      localStorage.setItem("entrevoz_name", "Review QA");
      localStorage.setItem("entrevoz_lang", "en");
      localStorage.setItem("entrevoz_name_prompted", "true");
      localStorage.setItem("entrevoz_onboarding_complete", "true");
      if (c) localStorage.setItem("entrevoz_ai_consent", "granted:test");
      if (stub) {
        // Simulate the App-Review device: the API EXISTS but the service is
        // unavailable (Siri/Dictation disabled) → service-not-allowed on start.
        class StubRec {
          constructor() {
            this.continuous = false;
            this.interimResults = false;
            this.lang = "";
            this.maxAlternatives = 1;
          }
          start() {
            setTimeout(() => {
              this.onerror?.({ error: "service-not-allowed" });
              this.onend?.();
            }, 150);
          }
          stop() {
            this.onend?.();
          }
          abort() {}
        }
        Object.defineProperty(window, "webkitSpeechRecognition", { value: StubRec });
        Object.defineProperty(window, "SpeechRecognition", { value: StubRec });
      }
    },
    consent,
    stubSpeech,
  );
  const transcribeCalls = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/transcribe")) transcribeCalls.push(r.url());
  });
  return { page, transcribeCalls };
}
const body = (p) => p.evaluate(() => document.body.innerText);

// ── A1) HOME: service-not-allowed → whisper fallback, no error ──────────────
const a = await newPage({ consent: true, stubSpeech: true });
await a.page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
// Voice tab, then the record button
await a.page.evaluate(() => {
  const tab = [...document.querySelectorAll("button")].find((b) => /voice/i.test(b.innerText));
  tab?.click();
});
await new Promise((r) => setTimeout(r, 800));
await a.page.evaluate(() => {
  document.querySelector('button[aria-label="Start recording"]')?.click();
});
await new Promise((r) => setTimeout(r, 2500)); // stub errors at 150ms → fallback kicks in
let txt = await body(a.page);
const homeNoError = !/error|not allowed|denied/i.test(txt);
// finish the utterance → whisper transcription fires
await a.page.evaluate(() => {
  document.querySelector('button[aria-label="Stop recording"]')?.click();
});
await new Promise((r) => setTimeout(r, 3000));
const homeWhisper = a.transcribeCalls.length > 0;
console.log(`A1 home: no error notification   : ${homeNoError ? "✅" : `❌ (${(txt.match(/[^\n]*(error|denied|allowed)[^\n]*/i) || [""])[0].slice(0, 80)})`}`);
console.log(`A1 home: whisper fallback fired  : ${homeWhisper ? "✅" : "❌"}`);
await a.page.browserContext().close().catch(() => {});

// ── A2) FACE-TO-FACE: same scenario ─────────────────────────────────────────
const f = await newPage({ consent: true, stubSpeech: true });
await f.page.goto(`${BASE}/face-to-face`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2000));
await f.page.evaluate(() => {
  const start = [...document.querySelectorAll("button")].find((b) => /start|begin|continue/i.test(b.innerText));
  start?.click();
});
await new Promise((r) => setTimeout(r, 1500));
// tap the bottom speaker's mic
await f.page.evaluate(() => {
  const mics = [...document.querySelectorAll("button")].filter((b) => b.className.includes("rounded-full"));
  mics[mics.length - 1]?.click();
});
await new Promise((r) => setTimeout(r, 2500));
txt = await body(f.page);
const f2fNoError = !/microphone error|service-not-allowed/i.test(txt);
const f2fListening = /listening|escuchando/i.test(txt) || (await f.page.evaluate(() =>
  [...document.querySelectorAll("*")].some((el) => el.className?.toString?.().includes("animate-pulse"))));
// finish the utterance
await f.page.evaluate(() => {
  const mics = [...document.querySelectorAll("button")].filter((b) => b.className.includes("rounded-full"));
  mics[mics.length - 1]?.click();
});
await new Promise((r) => setTimeout(r, 3000));
const f2fWhisper = f.transcribeCalls.length > 0;
console.log(`A2 f2f: no error notification    : ${f2fNoError ? "✅" : "❌"}`);
console.log(`A2 f2f: capture active           : ${f2fListening ? "✅" : "❌"}`);
console.log(`A2 f2f: whisper fallback fired   : ${f2fWhisper ? "✅" : "❌"}`);
await f.page.browserContext().close().catch(() => {});

// ── B) AI consent flow on a FRESH device ────────────────────────────────────
const c = await newPage({ consent: false, stubSpeech: false });
await c.page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
txt = await body(c.page);
const sheetShown = /your words power the translation/i.test(txt);
// "Not now" → dismiss
await c.page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /not now/i.test(x.innerText));
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
// Tap an AI feature (voice tab mic) → sheet must REAPPEAR
await c.page.evaluate(() => {
  const tab = [...document.querySelectorAll("button")].find((b) => /voice/i.test(b.innerText));
  tab?.click();
});
await new Promise((r) => setTimeout(r, 600));
await c.page.evaluate(() => {
  document.querySelector('button[aria-label="Start recording"]')?.click();
});
await new Promise((r) => setTimeout(r, 1000));
txt = await body(c.page);
const sheetReshown = /your words power the translation/i.test(txt);
// Agree → gone
await c.page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /agree/i.test(x.innerText));
  b?.click();
});
await new Promise((r) => setTimeout(r, 800));
txt = await body(c.page);
const sheetGone = !/your words power the translation/i.test(txt);
const persisted = await c.page.evaluate(() => localStorage.getItem("entrevoz_ai_consent") || "");
console.log(`B consent: shown on first launch : ${sheetShown ? "✅" : "❌"}`);
console.log(`B consent: re-shown on AI use    : ${sheetReshown ? "✅" : "❌"}`);
console.log(`B consent: Agree dismisses+saves : ${sheetGone && persisted.startsWith("granted") ? "✅" : `❌ (${persisted})`}`);
await c.page.browserContext().close().catch(() => {});

const pass = homeNoError && homeWhisper && f2fNoError && f2fListening && f2fWhisper && sheetShown && sheetReshown && sheetGone;
console.log(`\n${pass ? "ALL PASS" : "FAILURES PRESENT"}`);
await browser.close();
process.exit(pass ? 0 : 1);
