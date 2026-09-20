import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// GROUP CALL — INTEGRATION SUITE (the entry paths the pipeline suite skips)
//   1. /group landing → language preselect → Create → lobby carries it
//   2. Guest on an invite link with NO saved language (browser language wins)
//   3. AI-consent gate (App Review 5.1.1): no join until agreed, then it
//      continues by itself
//   4. Two-person call: remote audio element actually attached, speaking
//      state, translation banner
//   5. iOS shell UA (Capacitor WKWebView) joins and fits the screen
//   6. Late joiner sees a language someone switched to BEFORE they arrived
//   7. Invite links carry no ?lang= (guests must pick their own)
//   8. 5th joiner is refused cleanly (room full)
// usage: BASE=https://www.entrevoz.co node native/e2e-group-integration.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.BASE ?? "http://localhost:3100";
const ts = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});

function fakeSpeech() {
  window.__sr = { instances: [], active: null };
  class FakeSR {
    constructor() {
      this.continuous = false; this.interimResults = false; this.lang = ""; this.maxAlternatives = 1;
      this.onresult = this.onerror = this.onend = this.onstart = null;
      this._running = false; this._results = [];
      window.__sr.instances.push(this);
    }
    start() {
      if (this._running) throw new DOMException("already started", "InvalidStateError");
      this._running = true; this._results = []; window.__sr.active = this;
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
        res.isFinal = r.f; res.item = (i) => res[i];
        return res;
      });
      list.item = (i) => list[i];
      this.onresult && this.onresult({ resultIndex: 0, results: list });
    }
  }
  Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeSR, configurable: true });
  Object.defineProperty(window, "SpeechRecognition", { value: FakeSR, configurable: true });
  window.__say = async (text, stepMs = 110) => {
    const r = window.__sr.active;
    if (!r) return "no-active";
    const words = text.split(" ");
    r._results.push({ t: "", f: false });
    const idx = r._results.length - 1;
    for (let i = 1; i <= words.length; i++) {
      if (window.__sr.active !== r) return "replaced";
      r._results[idx].t = words.slice(0, i).join(" ");
      r._emit();
      await new Promise((res) => setTimeout(res, stepMs));
    }
    r._results[idx].f = true;
    r._emit();
    return "ok";
  };
  // Capture invite links instead of opening WhatsApp
  window.__opened = [];
  window.open = (url) => { window.__opened.push(String(url)); return null; };
}

async function device(name, { lang = null, consent = true, langs = ["en-US", "en"], ua = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  if (ua) await page.setUserAgent(ua);
  const errors = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (r.url().includes("/api/")) requests.push(r.url().replace(BASE, "")); });
  await page.evaluateOnNewDocument(
    (n, l, c, ls, id) => {
      localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_onboarding_complete", "true");
      localStorage.setItem("entrevoz_name_prompted", "true");
      if (n) localStorage.setItem("entrevoz_name", n);
      if (l) localStorage.setItem("entrevoz_lang", l);
      if (c) localStorage.setItem("entrevoz_ai_consent", "granted:test");
      Object.defineProperty(navigator, "languages", { get: () => ls, configurable: true });
      Object.defineProperty(navigator, "language", { get: () => ls[0], configurable: true });
    },
    name, lang, consent, langs, `e2ei${(name ?? "anon").toLowerCase()}-0000-4000-8000-${ts}`,
  );
  await page.evaluateOnNewDocument(fakeSpeech);
  return { page, name, errors, requests };
}

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

const pressedLang = (page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim());
    const more = [...document.querySelectorAll("select")].map((s) => s.value);
    return { pressed: btn, selects: more };
  });

const clickJoin = (page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^(join call|unirme)$/i.test(b.textContent.trim()));
    btn?.click();
    return !!btn;
  });

const phaseOf = (page) => page.evaluate(() => document.querySelector("[data-phase]")?.getAttribute("data-phase") ?? "lobby");
const tilesText = (page) => page.evaluate(() => [...document.querySelectorAll("[data-tile-slot]")].map((e) => e.textContent).join(" | "));

// ── 1. Landing → create carries the language ────────────────────────────────
const creator = await device("Sofia", { lang: null, langs: ["es-ES", "es"] });
await creator.page.goto(`${BASE}/group`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1200);
const landingLang = await pressedLang(creator.page);
check("landing: Spanish browser preselects ES (no saved pref)", landingLang.pressed.some((t) => /ES/.test(t)), JSON.stringify(landingLang));
await creator.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /create group call/i.test(b.textContent))?.click();
});
const createdUrl = await waitFor(async () => {
  const u = creator.page.url();
  return /\/group\/[A-Z0-9]{6}/.test(u) ? u : null;
}, 25000);
check("landing: Create lands in a room", !!createdUrl, createdUrl ?? "");
const CODE = createdUrl ? createdUrl.match(/\/group\/([A-Z0-9]{6})/)[1] : null;
check("landing: the chosen language travels to the lobby (?lang=es)", !!createdUrl && /lang=es/.test(createdUrl), createdUrl ?? "");
await sleep(1500);
const lobbySel = await creator.page.evaluate(() => document.querySelector('[data-testid="lobby-language"]')?.getAttribute("data-selected"));
check("landing: lobby shows that language selected", lobbySel === "es", `selected=${lobbySel}`);
await creator.page.type("#gc-name", "Sofia");
await clickJoin(creator.page);
const creatorActive = await waitFor(async () => (await phaseOf(creator.page)) === "active", 30000);
check("landing: creator joins the call", !!creatorActive);

// ── 2. Guest on an invite link, no saved language → browser language ────────
const guest = await device("Luc", { lang: null, langs: ["fr-FR", "fr"] });
await guest.page.goto(`${BASE}/group/${CODE}?type=video`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1500);
const guestSel = await guest.page.evaluate(() => document.querySelector('[data-testid="lobby-language"]')?.getAttribute("data-selected"));
check("guest: French browser preselects FR on an invite link", guestSel === "fr", `selected=${guestSel}`);
// The guest changes it themselves (the whole point of the lobby picker)
await guest.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /^\s*🇧🇷?\s*PT\s*$/m.test(b.textContent.trim()) || /PT/.test(b.textContent.trim()))?.click();
});
await sleep(500);
const guestSel2 = await guest.page.evaluate(() => document.querySelector('[data-testid="lobby-language"]')?.getAttribute("data-selected"));
check("guest: picking PT updates the selection", guestSel2 === "pt", `selected=${guestSel2}`);
await guest.page.type("#gc-name", "Luc");
await clickJoin(guest.page);
const guestActive = await waitFor(async () => (await phaseOf(guest.page)) === "active", 30000);
check("guest: joins the call", !!guestActive);
const sawPt = await waitFor(async () => /Luc[^|]*Portugu/.test(await tilesText(creator.page)), 20000);
check("guest: creator's tile shows Luc speaks Português", !!sawPt, (await tilesText(creator.page)).slice(0, 120));

// ── 3. Two people: audio attached, speaking state, banner ──────────────────
const audioAttached = await waitFor(
  () => creator.page.evaluate(() => [...document.querySelectorAll("audio")].filter((a) => a.srcObject).length),
  20000,
);
check("media: remote audio element has a stream attached", (audioAttached ?? 0) >= 1, `${audioAttached} attached`);
const banner = await creator.page.evaluate(() => document.querySelector('[data-testid="translation-banner"]')?.textContent ?? "");
check("banner: says everything is translated into Español", /traducen al Espa/i.test(banner), banner);
await guest.page.evaluate(() => window.__say("bom dia a todos eu sou o Luc"));
const speaking = await waitFor(
  () => creator.page.evaluate(() => [...document.querySelectorAll('[data-tile-slot][data-speaking="true"]')].length > 0),
  8000,
);
check("speaking: the talker's tile lights up", !!speaking);
const ptLine = await waitFor(async () => {
  const items = await creator.page.evaluate(() =>
    [...document.querySelectorAll("[data-feed-item]")].map((el) => ({
      status: el.getAttribute("data-status"), target: el.getAttribute("data-target"),
      main: el.querySelector("[data-main-text]")?.textContent?.trim() ?? "",
    })));
  const last = items[items.length - 1];
  return last && last.status === "done" && last.target === "es" ? last : null;
}, 15000);
check("pt→es: Portuguese reaches the Spanish listener in Spanish", !!ptLine, JSON.stringify(ptLine));

// ── 4. Invite links must NOT carry a language ──────────────────────────────
await creator.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /invitar|invite/i.test(b.textContent))?.click();
});
const opened = await creator.page.evaluate(() => window.__opened ?? []);
check("invite: link carries no ?lang= (guests pick their own)", opened.length > 0 && !opened.some((u) => /lang=/.test(u)), opened.join(" ").slice(0, 120));

// ── 5. AI-consent gate (App Review 5.1.1) ──────────────────────────────────
const fresh = await device("Nora", { lang: "en", consent: false });
await fresh.page.goto(`${BASE}/group/${CODE}?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1500);
const sheetFirst = await fresh.page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="AI translation consent"]'));
check("consent: sheet appears on first launch", sheetFirst);
await fresh.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /not now/i.test(b.textContent))?.click();
});
await sleep(400);
await fresh.page.type("#gc-name", "Nora");
await clickJoin(fresh.page);
await sleep(2500);
const afterDecline = {
  phase: await phaseOf(fresh.page),
  sheet: await fresh.page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="AI translation consent"]')),
  joined: fresh.requests.some((u) => u.includes("/api/group/join")),
  sent: fresh.requests.some((u) => u.includes("/api/translate") || u.includes("/api/transcribe")),
};
check("consent: declining blocks the join (nothing sent)", afterDecline.phase !== "active" && !afterDecline.joined && !afterDecline.sent, JSON.stringify(afterDecline));
check("consent: tapping Join re-opens the sheet", afterDecline.sheet);
await fresh.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /agree & continue|aceptar y continuar/i.test(b.textContent))?.click();
});
const consentJoined = await waitFor(async () => (await phaseOf(fresh.page)) === "active", 30000);
check("consent: agreeing continues the join automatically", !!consentJoined);

// ── 6. iOS shell (Capacitor WKWebView) ─────────────────────────────────────
const shell = await device("Shelly", { lang: "en", ua: SHELL_UA });
await shell.page.goto(`${BASE}/group/${CODE}?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1200);
await shell.page.type("#gc-name", "Shelly");
await clickJoin(shell.page);
const shellActive = await waitFor(async () => (await phaseOf(shell.page)) === "active", 30000);
check("shell: iOS app UA joins the call", !!shellActive);
const shellLayout = await shell.page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - window.innerWidth,
  stt: document.querySelector("[data-stt-state]")?.getAttribute("data-stt-state") ?? "none",
  controls: [...document.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label")).map((b) => b.getAttribute("aria-label")),
}));
check("shell: no horizontal overflow at 390px", shellLayout.overflow <= 1, `overflow=${shellLayout.overflow}px`);
check("shell: caption status + controls present", shellLayout.stt !== "none" && shellLayout.controls.length >= 3, JSON.stringify(shellLayout).slice(0, 160));

// ── 7. Room full is refused cleanly ────────────────────────────────────────
const fifth = await fetch(`${BASE}/api/group/join`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ roomCode: CODE, deviceId: `e2ei-fifth-${ts}`, displayName: "Five", language: "en", sessionTag: `fifth${ts}`.slice(0, 12) }),
});
const fifthBody = await fifth.json();
check("full: a 5th joiner is refused with a clear message", fifth.status === 409 && /full/i.test(fifthBody.error ?? ""), `${fifth.status} ${fifthBody.error ?? ""}`);

// ── 8. Late joiner sees a language switched BEFORE they arrived ────────────
await creator.page.select('[data-testid="lang-select"]', "de"); // Sofia: es → de
await sleep(2000);
await shell.page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /leave call|salir/i.test(b.getAttribute("aria-label") ?? ""))?.click();
});
await sleep(2500);
const late = await device("Late", { lang: "en" });
await late.page.goto(`${BASE}/group/${CODE}?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1200);
await late.page.type("#gc-name", "Late");
await clickJoin(late.page);
const lateActive = await waitFor(async () => (await phaseOf(late.page)) === "active", 30000);
check("late: joins after someone switched language", !!lateActive);
const lateSeesDe = await waitFor(async () => /Sofia[^|]*Deutsch/.test(await tilesText(late.page)), 25000);
check("late: sees Sofia's CURRENT language (Deutsch), not the stale one", !!lateSeesDe, (await tilesText(late.page)).slice(0, 160));

// ── 9. A dead / expired invite link says so instead of hanging ────────────
const deadDev = await device("Dead", { lang: "en" });
await deadDev.page.goto(`${BASE}/group/ZZZZZZ?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(1000);
await deadDev.page.type("#gc-name", "Dead");
await clickJoin(deadDev.page);
const deadMsg = await waitFor(async () => {
  const txt = await deadDev.page.evaluate(() => document.body.innerText);
  return /not found|no existe|went wrong|salió mal/i.test(txt) ? txt.replace(/\s+/g, " ").slice(0, 100) : null;
}, 25000);
check("dead link: clear error instead of hanging", !!deadMsg, deadMsg ?? "(still spinning)");

// ── 10. Refresh mid-call — the thing people do when it looks stuck ────────
const room2 = await fetch(`${BASE}/api/group/create`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ callType: "audio", deviceId: `e2ei-refresh-${ts}` }),
}).then((r) => r.json());
const rA = await device("Ana", { lang: "es" });
const rB = await device("Ben", { lang: "en" });
for (const d of [rA, rB]) {
  await d.page.goto(`${BASE}/group/${room2.roomCode}?type=audio`, { waitUntil: "networkidle2", timeout: 45000 });
  await sleep(1200); // let the saved name prefill before joining
  await clickJoin(d.page);
  await sleep(1200);
}
const pairUp = await waitFor(async () => {
  const c = await Promise.all([rA, rB].map((d) => d.page.evaluate(() => document.querySelector('[data-testid="people-count"]')?.textContent ?? "")));
  return c.every((x) => x.startsWith("2")) ? c : null;
}, 40000);
check("refresh: two-person call connected first", !!pairUp, JSON.stringify(pairUp));
await rA.page.reload({ waitUntil: "networkidle2", timeout: 45000 });
await sleep(1200);
const prefilled = await rA.page.evaluate(() => document.querySelector("#gc-name")?.value ?? "");
check("refresh: name prefilled from last time (no retyping)", prefilled === "Ana", `"${prefilled}"`);
await clickJoin(rA.page);
const rejoined = await waitFor(async () => {
  const c = await Promise.all([rA, rB].map((d) => d.page.evaluate(() => document.querySelector('[data-testid="people-count"]')?.textContent ?? "")));
  return c.every((x) => x.startsWith("2")) ? c : null;
}, 45000);
check("refresh: both see each other again after a reload", !!rejoined, JSON.stringify(rejoined));
const tilesAfter = await Promise.all([rB, rA].map((d) =>
  d.page.evaluate(() => [...document.querySelectorAll("[data-tile-slot]")].map((e) => e.textContent.replace(/\s+/g, " ")))));
check("refresh: exactly one tile each side (no ghost, no duplicate)",
  tilesAfter[0].length === 1 && /Ana/.test(tilesAfter[0][0]) && tilesAfter[1].length === 1 && /Ben/.test(tilesAfter[1][0]),
  JSON.stringify(tilesAfter).slice(0, 160));

const pageErrors = [creator, guest, fresh, shell, late, deadDev, rA, rB].flatMap((d) => d.errors.map((e) => `${d.name}: ${e}`));
check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" · "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${results.length} checks)`);
process.exit(failed === 0 ? 0 : 1);
