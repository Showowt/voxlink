import puppeteer from "puppeteer-core";
// App Review 5.1.1(i)/5.1.2(i) leak audit.
// Fresh install on the reviewer's device profile (iPad Air 11", native-shell
// UA). Decline AI consent ("Not now"), then drive every AI-capable surface and
// record any request that would carry user content to an AI/translation
// service. PASS = zero such requests while consent is not granted.
//
//   BASE=https://www.entrevoz.co node native/audit-ai-consent.mjs
//
// Screenshots land in $OUT (default /tmp/entrevoz-consent-audit).

import fs from "node:fs";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const OUT = process.env.OUT || "/tmp/entrevoz-consent-audit";
const UA =
  "Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
fs.mkdirSync(OUT, { recursive: true });

// Same-origin routes that forward user content to a third party.
const AI_ROUTE =
  /\/api\/(translate|translate-tone|transcribe|voice-dub|voice-clone|cyrano|language-os\/chat|language-os\/tts|learning-insights|summary|cultural-context|detect-language)(\/|\?|$)/;
// Direct third-party hosts (should never be hit from the client at all).
const AI_HOST =
  /(api\.openai\.com|api\.anthropic\.com|elevenlabs\.io|translate\.googleapis\.com|mymemory\.translated\.net|libretranslate|lingva)/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });

let step = "boot";
const leaks = [];
const blocked = [];
page.on("request", async (req) => {
  const url = req.url();
  if (!AI_ROUTE.test(url) && !AI_HOST.test(url)) return;
  leaks.push({ step, method: req.method(), url: url.replace(BASE, "").slice(0, 110) });
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (AI_ROUTE.test(url) || AI_HOST.test(url)) blocked.push({ step, url: url.replace(BASE, "").slice(0, 110) });
});

async function consentState() {
  return page.evaluate(() => {
    let v = null;
    try { v = localStorage.getItem("entrevoz_ai_consent"); } catch {}
    const sheet = document.querySelector('[aria-label="AI translation consent"]');
    return { stored: v, sheetOpen: !!sheet };
  });
}

async function clickText(re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const el = [...document.querySelectorAll("button, a, [role=button]")].find(
      (b) => rx.test((b.innerText || "") + " " + (b.getAttribute("aria-label") || "")) && b.offsetParent !== null,
    );
    if (!el) return null;
    el.click();
    return (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40);
  }, re.source);
}

async function declineIfOpen() {
  const s = await consentState();
  if (s.sheetOpen) await clickText(/^Not now/);
  await sleep(300);
}

async function typeEverywhere(text) {
  const handles = await page.$$("textarea, input[type=text], input:not([type])");
  let n = 0;
  for (const h of handles) {
    const visible = await h.evaluate((e) => e.offsetParent !== null && !e.disabled && !/name|code/i.test(e.placeholder || ""));
    if (!visible) continue;
    await h.click().catch(() => {});
    await declineIfOpen();
    await h.type(text, { delay: 15 }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    n++;
    await sleep(1500);
    await declineIfOpen();
  }
  return n;
}

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

// ── 1. First launch ─────────────────────────────────────────────────────────
step = "first-launch";
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
await sleep(3000);
await shot("01-first-launch");
const first = await consentState();
const topmost = await page.evaluate(() => {
  const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 120);
  return el?.closest('[role=dialog]')?.getAttribute("aria-label") || el?.closest("[class*='fixed']")?.className?.slice(0, 60) || el?.tagName;
});
console.log("first launch:", JSON.stringify(first), "topmost at bottom-center:", topmost);

// Decline, then clear onboarding / name prompts.
await declineIfOpen();
await clickText(/get started|empezar/);
await sleep(800);
await declineIfOpen();
await clickText(/^skip|later|omitir/);
await sleep(500);
await declineIfOpen();
console.log("after decline:", JSON.stringify(await consentState()));

// ── 2. Home feature tabs ────────────────────────────────────────────────────
for (const [cat, tabs] of [
  ["Translate", ["Type", "Voice"]],
  ["Connect", ["Talk", "Video Call", "Group", "Contacts"]],
  ["Tools", ["Wingman", "Practice"]],
]) {
  await clickText(new RegExp("^" + cat + "$"));
  await sleep(400);
  for (const t of tabs) {
    step = `home:${t}`;
    await clickText(new RegExp(t.replace(" ", "\\s*")));
    await sleep(700);
    await declineIfOpen();
    const typed = await typeEverywhere("Hello, how are you today?");
    const mic = await clickText(/start recording|🎤|tap to speak|mic/);
    await sleep(2500);
    await declineIfOpen();
    await shot(`02-home-${t.replace(/\s/g, "")}`);
    console.log(`${step}: typed=${typed} mic=${mic}`);
  }
}

// ── 3. Standalone AI pages ──────────────────────────────────────────────────
for (const path of ["/face-to-face", "/language-os", "/wingman", "/cyrano", "/history", "/dial", "/dashboard", "/settings"]) {
  step = `page:${path}`;
  await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
  await sleep(2000);
  await declineIfOpen();
  if (path === "/language-os") {
    await clickText(/Colombian Spanish/);
    await sleep(3000);
    await declineIfOpen();
    await clickText(/start|empezar|begin|chat/);
    await sleep(1500);
    await declineIfOpen();
    step = `page:${new URL(page.url()).pathname}`;
  }
  if (path === "/wingman") {
    await clickText(/^Text/);
    await sleep(300);
    await clickText(/Activate Wingman/);
    await sleep(2000);
    await declineIfOpen();
  }
  if (path === "/face-to-face") {
    await clickText(/start|begin|comenzar/);
    await sleep(1200);
    await declineIfOpen();
  }
  const typed = await typeEverywhere("Where is the train station?");
  const mic = await clickText(/start recording|🎤|tap to speak|hold to talk|mic/);
  await sleep(2500);
  await declineIfOpen();
  await shot(`03-${path.replace(/\//g, "_")}`);
  console.log(`${step}: typed=${typed} mic=${mic}`);
}

// ── 4. Direct probe of every AI route from page context ─────────────────────
// Proves the chokepoint covers code paths the UI walk can't reach.
step = "probe";
await page.evaluate(() => localStorage.setItem("entrevoz_ai_consent", "declined:" + new Date().toISOString()));
await page.goto(BASE + "/dial", { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
await clickText(/^Don.t Allow$/);
const probes = await page.evaluate(async () => {
  const routes = [
    "translate", "translate-tone", "transcribe", "voice-dub", "voice-clone", "cyrano",
    "language-os/chat", "language-os/tts", "language-os/entrevoz-bridge",
    "learning-insights", "summary", "cultural-context", "detect-language",
  ];
  // A request while declined re-opens the sheet and waits for an answer —
  // answer it the way a declining user would.
  const clicker = setInterval(() => {
    const b = [...document.querySelectorAll('[aria-label="AI translation consent"] button')].find((x) =>
      /Don.t Allow/.test(x.innerText),
    );
    b?.click();
  }, 100);
  const out = {};
  for (const r of routes) {
    const res = await fetch(`/api/${r}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    out[r] = res.status;
  }
  clearInterval(clicker);
  return out;
});
const unblocked = Object.entries(probes).filter(([, st]) => st !== 451);
console.log("direct probes:", JSON.stringify(probes));
if (unblocked.length) console.log("UNBLOCKED ROUTES:", unblocked.map(([r]) => r).join(", "));

console.log("\n=== AI requests issued while consent NOT granted ===");
const s = await consentState();
console.log("final consent:", JSON.stringify(s));
if (!leaks.length) console.log("NONE — PASS");
for (const l of leaks) console.log(`LEAK [${l.step}] ${l.method} ${l.url}`);
if (blocked.length) console.log("(failed/aborted:", blocked.length, ")");
console.log(`screenshots: ${OUT}`);
await browser.close();
process.exit(leaks.length || unblocked.length ? 1 : 0);
