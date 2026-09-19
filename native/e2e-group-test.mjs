import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// GROUP CALL E2E — 4 isolated browsers in one room, scripted speech engines.
//   Alice (en, Chrome-style results) · Bruno (es, iOS-style: one growing
//   result that is NEVER final) · Chloé (fr → switches to es mid-call) ·
//   Dana (en, speech service refuses → must fall back to Whisper).
// Asserts every listener reads every speaker in THEIR OWN language, one line
// per utterance, mute really stops captions, a language switch leaves exactly
// one recognizer running (in the new language), translation failures show
// the original + Retry (never the source dressed up as a translation), and
// leaving removes the tile.
// usage: BASE=https://www.entrevoz.co node native/e2e-group-test.mjs
//        (default BASE = http://localhost:3100)
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.BASE ?? "http://localhost:3100";
const ts = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

// Scripted SpeechRecognition. mode "chrome": a new result per utterance that
// ends final. mode "ios": one ever-growing result that is never final.
function fakeSpeech(failMode) {
  window.__sr = { instances: [], starts: [], active: null };
  class FakeSR {
    constructor() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = "";
      this.maxAlternatives = 1;
      this.onresult = this.onerror = this.onend = this.onstart = null;
      this._running = false;
      this._results = [];
      window.__sr.instances.push(this);
    }
    start() {
      if (this._running) throw new DOMException("already started", "InvalidStateError");
      this._running = true;
      this._results = [];
      window.__sr.starts.push(this.lang);
      if (failMode) {
        setTimeout(() => {
          this.onerror && this.onerror({ error: failMode });
          this._end();
        }, 30);
        return;
      }
      window.__sr.active = this;
      setTimeout(() => this.onstart && this.onstart(), 5);
    }
    stop() { this._end(); }
    abort() { this._end(); }
    _end() {
      if (!this._running) return;
      this._running = false;
      if (window.__sr.active === this) window.__sr.active = null;
      setTimeout(() => this.onend && this.onend(), 5);
    }
    _emit() {
      const list = this._results.map((r) => {
        const res = [{ transcript: r.t, confidence: 0.9 }];
        res.isFinal = r.f;
        res.item = (i) => res[i];
        return res;
      });
      list.item = (i) => list[i];
      this.onresult && this.onresult({ resultIndex: 0, results: list });
    }
  }
  Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeSR, configurable: true });
  Object.defineProperty(window, "SpeechRecognition", { value: FakeSR, configurable: true });
  window.__say = async (text, mode = "chrome", stepMs = 110) => {
    const r = window.__sr.active;
    if (!r) return "no-active";
    const words = text.split(" ");
    let idx;
    if (mode === "ios") {
      if (!r._results.length) r._results.push({ t: "", f: false });
      idx = 0;
    } else {
      r._results.push({ t: "", f: false });
      idx = r._results.length - 1;
    }
    const base = r._results[idx].t;
    for (let i = 1; i <= words.length; i++) {
      if (window.__sr.active !== r) return "replaced";
      r._results[idx].t = (base ? `${base} ` : "") + words.slice(0, i).join(" ");
      r._emit();
      await new Promise((res) => setTimeout(res, stepMs));
    }
    if (mode === "chrome") {
      r._results[idx].f = true;
      r._emit();
    }
    return "ok";
  };
  window.__running = () => window.__sr.instances.filter((i) => i._running);
}

async function device(name, lang, { failMode = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(
    (n, l, id) => {
      localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_name", n);
      localStorage.setItem("entrevoz_lang", l);
      localStorage.setItem("entrevoz_ai_consent", "granted:test");
      localStorage.setItem("entrevoz_onboarding_complete", "true");
      localStorage.setItem("entrevoz_name_prompted", "true");
    },
    name,
    lang,
    `e2eg${name.toLowerCase()}-0000-4000-8000-${ts}`,
  );
  await page.evaluateOnNewDocument(fakeSpeech, failMode);
  return { page, name, errors };
}

const feed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-feed-item]")].map((el) => ({
      me: el.getAttribute("data-me") === "true",
      speaker: el.getAttribute("data-speaker"),
      status: el.getAttribute("data-status"),
      target: el.getAttribute("data-target"),
      final: el.getAttribute("data-final") === "true",
      main: el.querySelector("[data-main-text]")?.textContent?.trim() ?? el.textContent.trim(),
      original: el.querySelector("[data-original-text]")?.textContent?.trim() ?? "",
      hasRetry: [...el.querySelectorAll("button")].some((b) => /retry|reintentar/i.test(b.textContent)),
    })),
  );

async function waitFor(fn, timeoutMs, stepMs = 250) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(stepMs);
  }
  return last;
}

const fromSpeaker = (items, speaker, needle) =>
  items.filter((i) => !i.me && i.speaker === speaker && (!needle || `${i.main} ${i.original}`.toLowerCase().includes(needle)));

// ── Room ─────────────────────────────────────────────────────────────────────
const created = await fetch(`${BASE}/api/group/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ callType: "audio", deviceId: `e2e-group-host-${ts}` }),
}).then((r) => r.json());
const CODE = created.roomCode;
console.log(`room ${CODE} @ ${BASE}`);

const A = await device("Alice", "en");
const B = await device("Bruno", "es");
const C = await device("Chloe", "fr");
const D = await device("Dana", "en", { failMode: "service-not-allowed" });

// ── Lobby: the device language is what's shown selected ─────────────────────
for (const d of [A, B, C, D]) {
  await d.page.goto(`${BASE}/group/${CODE}?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
}
await sleep(800);
const bLobby = await B.page.evaluate(() => {
  const box = document.querySelector('[data-testid="lobby-language"]');
  const pressed = [...(box?.querySelectorAll('button[aria-pressed="true"]') ?? [])].map((b) => b.textContent.trim());
  return { selected: box?.getAttribute("data-selected"), pressed, joinLabel: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /unirme|join/i.test(t)) };
});
check("lobby: saved Spanish preselected (state)", bLobby.selected === "es", JSON.stringify(bLobby));
check("lobby: Spanish chip visibly selected", bLobby.pressed.some((t) => /ES/.test(t)), bLobby.pressed.join(","));
check("lobby: UI follows chosen language (Unirme)", /unirme/i.test(bLobby.joinLabel ?? ""), bLobby.joinLabel);

async function join(d) {
  await d.page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^(join call|unirme)$/i.test(b.textContent.trim()));
    btn?.click();
  });
}
for (const d of [A, B, C]) {
  await join(d);
  await sleep(1200);
}
const connected = await waitFor(async () => {
  const counts = await Promise.all([A, B, C].map((d) => d.page.evaluate(() => document.querySelector('[data-testid="people-count"]')?.textContent ?? "")));
  return counts.every((c) => c.startsWith("3")) ? counts : null;
}, 40000);
check("mesh: all three see 3 people", !!connected, JSON.stringify(connected));

// Wait until every recognizer is live
await waitFor(async () => {
  const r = await Promise.all([A, B, C].map((d) => d.page.evaluate(() => window.__running().length)));
  return r.every((n) => n === 1);
}, 10000);
const langs = await Promise.all([A, B, C].map((d) => d.page.evaluate(() => window.__running().map((r) => r.lang))));
check("stt: recognizers use BCP-47 codes", JSON.stringify(langs) === JSON.stringify([["en-US"], ["es-ES"], ["fr-FR"]]), JSON.stringify(langs));

// ── 1. Chrome-style English → Spanish for Bruno, French for Chloé ───────────
await A.page.evaluate(() => window.__say("good morning everyone how are you doing today"));
const bGot = await waitFor(async () => {
  const f = fromSpeaker(await feed(B.page), "Alice");
  return f.length && f[f.length - 1].status === "done" ? f : null;
}, 12000);
const bLine = bGot?.[bGot.length - 1];
check("en→es: Bruno gets Alice translated into Spanish", !!bLine && bLine.target === "es" && bLine.main.toLowerCase() !== "good morning everyone how are you doing today", JSON.stringify(bLine));
check("en→es: one line per utterance (no interim spam)", (bGot ?? []).length === 1, `${(bGot ?? []).length} lines`);
const cGot = await waitFor(async () => {
  const f = fromSpeaker(await feed(C.page), "Alice");
  return f.length && f[f.length - 1].status === "done" ? f : null;
}, 12000);
const cLine = cGot?.[cGot.length - 1];
check("en→fr: Chloé gets the SAME line in French", !!cLine && cLine.target === "fr" && cLine.main !== bLine?.main, JSON.stringify(cLine));

// ── 2. iOS-style (never final) Spanish → English for Alice ──────────────────
await B.page.evaluate(() => window.__say("hola a todos me llamo Bruno y vivo en Madrid", "ios"));
const aGot = await waitFor(async () => {
  const f = fromSpeaker(await feed(A.page), "Bruno");
  return f.length && f[f.length - 1].status === "done" ? f : null;
}, 12000);
const aLine = aGot?.[aGot.length - 1];
check("ios never-final es→en: finalized + translated for Alice", !!aLine && aLine.target === "en" && /bruno/i.test(aLine.main) && !/hola a todos/i.test(aLine.main), JSON.stringify(aLine));
const bSelf = (await feed(B.page)).filter((i) => i.me);
check("ios: speaker sees own line finalized", bSelf.length === 1 && bSelf[0].final, JSON.stringify(bSelf));
// A second iOS utterance in the SAME growing result must become a NEW line
await B.page.evaluate(() => window.__say("y me gusta mucho el café", "ios"));
const aGot2 = await waitFor(async () => {
  const f = fromSpeaker(await feed(A.page), "Bruno");
  return f.length >= 2 && f[f.length - 1].status === "done" ? f : null;
}, 12000);
check("ios: follow-up becomes its own line (delta only)", !!aGot2 && aGot2.length === 2 && !/bruno/i.test(aGot2[1].original), JSON.stringify(aGot2?.map((x) => x.original)));

// ── 3. Mid-call language switch: Chloé fr → es ──────────────────────────────
await C.page.select('[data-testid="lang-select"]', "es");
await sleep(1200);
const cRunning = await C.page.evaluate(() => window.__running().map((r) => r.lang));
check("switch: exactly ONE recognizer, in the new language", JSON.stringify(cRunning) === JSON.stringify(["es-ES"]), JSON.stringify(cRunning));
const aSeesSwitch = await waitFor(async () => {
  const txt = await A.page.evaluate(() => [...document.querySelectorAll("[data-tile-slot]")].map((e) => e.textContent).join(" | "));
  return /Chloe[^|]*Español/.test(txt) ? txt : null;
}, 6000);
check("switch: others see Chloé now speaks Spanish", !!aSeesSwitch, aSeesSwitch ?? "");
await A.page.evaluate(() => window.__say("the weather is really nice this afternoon"));
const cEs = await waitFor(async () => {
  const f = fromSpeaker(await feed(C.page), "Alice", "");
  const last = f[f.length - 1];
  return last && last.status === "done" && last.target === "es" && /weather|afternoon/i.test(last.original) ? last : null;
}, 12000);
check("switch: Chloé now reads Alice in Spanish", !!cEs, JSON.stringify(cEs));

// ── 4. Mute really stops captions ───────────────────────────────────────────
await A.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Mute")?.click();
});
await sleep(600);
const aMuted = await A.page.evaluate(async () => ({ running: window.__running().length, say: await window.__say("this line must never be sent") }));
await sleep(2500);
const leaked = (await feed(B.page)).some((i) => /never be sent/i.test(`${i.main} ${i.original}`));
check("mute: no recognizer running", aMuted.running === 0 && aMuted.say === "no-active", JSON.stringify(aMuted));
check("mute: nothing reached others", !leaked);
await A.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Unmute")?.click();
});
const unmuted = await waitFor(() => A.page.evaluate(() => window.__running().length === 1), 5000);
check("unmute: recognizer back", !!unmuted);

// ── 5. Failed translation → original + Retry, never fake ────────────────────
await B.page.setRequestInterception(true);
let failNext = true;
B.page.on("request", (req) => {
  if (failNext && req.url().includes("/api/translate") && (req.postData() ?? "").includes("fail on purpose")) {
    req.respond({ status: 500, contentType: "application/json", body: JSON.stringify({ translation: "", error: "Failed" }) });
  } else {
    req.continue();
  }
});
await A.page.evaluate(() => window.__say("this sentence will fail on purpose"));
const failed = await waitFor(async () => {
  const f = fromSpeaker(await feed(B.page), "Alice", "fail on purpose");
  return f.length && f[0].status === "failed" ? f[0] : null;
}, 15000);
check("fail: shows 'failed' with the original + Retry", !!failed && failed.hasRetry && /fail on purpose/i.test(failed.main), JSON.stringify(failed));
failNext = false;
await B.page.evaluate(() => {
  const item = [...document.querySelectorAll('[data-feed-item][data-status="failed"]')].pop();
  [...(item?.querySelectorAll("button") ?? [])].find((b) => /retry|reintentar/i.test(b.textContent))?.click();
});
const retried = await waitFor(async () => {
  const f = fromSpeaker(await feed(B.page), "Alice", "fail on purpose");
  return f.length && f[0].status === "done" ? f[0] : null;
}, 12000);
check("fail: Retry translates it", !!retried && retried.target === "es", JSON.stringify(retried));

// ── 6. Speech service refused → Whisper backup ──────────────────────────────
await join(D);
const dEngine = await waitFor(
  () => D.page.evaluate(() => {
    const el = document.querySelector("[data-stt-engine]");
    return el && el.getAttribute("data-stt-engine") === "whisper" ? el.getAttribute("data-stt-state") : null;
  }),
  20000,
);
check("fallback: service-not-allowed → Whisper backup, no dead end", dEngine === "listening", `state=${dEngine}`);
const four = await waitFor(async () => {
  const counts = await Promise.all([A, B, C, D].map((d) => d.page.evaluate(() => document.querySelector('[data-testid="people-count"]')?.textContent ?? "")));
  return counts.every((c) => c.startsWith("4")) ? counts : null;
}, 30000);
check("mesh: late joiner seen by everyone (4 people)", !!four, JSON.stringify(four));

// ── 7. Leaving removes the tile everywhere ──────────────────────────────────
await C.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /leave call|salir/i.test(b.getAttribute("aria-label") ?? ""))?.click();
});
const three = await waitFor(async () => {
  const counts = await Promise.all([A, B, D].map((d) => d.page.evaluate(() => document.querySelector('[data-testid="people-count"]')?.textContent ?? "")));
  return counts.every((c) => c.startsWith("3")) ? counts : null;
}, 20000);
check("leave: others drop to 3, no ghost tile", !!three, JSON.stringify(three));

const pageErrors = [A, B, C, D].flatMap((d) => d.errors.map((e) => `${d.name}: ${e}`));
check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" · "));

await browser.close();
const failedCount = results.filter((r) => !r.ok).length;
console.log(`\n${failedCount === 0 ? "ALL PASS" : `${failedCount} FAILED`} (${results.length} checks)`);
process.exit(failedCount === 0 ? 0 : 1);
