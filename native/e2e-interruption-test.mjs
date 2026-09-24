import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// iOS-INTERRUPTION RECOVERY E2E against production.
// Simulates a phone-call/FaceTime interruption with the same mechanism iOS
// uses: the page is FROZEN (JS+timers+socket starved) for 70s — long enough
// for the Daily meeting to die server-side — then thawed. PASS = the call
// recovers IN PLACE (no reload: a window marker must survive), the partner
// reappears on both sides, and no manual action was needed.
// usage: node native/e2e-interruption-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.BASE || "https://www.entrevoz.co";
const CODE = `QI${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const ts = Date.now().toString().slice(-12);
const A_ID = `e2ex1000-0000-4000-8000-${ts}`;
const B_ID = `e2ex2000-0000-4000-8000-${ts}`;
const FREEZE_MS = 70000;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function newDevice(deviceId, name, lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument(
    (id, n, l) => {
      localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_name", n);
      localStorage.setItem("entrevoz_lang", l);
      localStorage.setItem("entrevoz_name_prompted", "true");
      localStorage.setItem("entrevoz_onboarding_complete", "true");
      localStorage.setItem("entrevoz_ai_consent", "granted:test");
    },
    deviceId,
    name,
    lang,
  );
  page.on("console", (m) => {
    const t = m.text();
    if (/\[Daily\]|\[Entrevoz\]|recover/i.test(t) && !/net::|favicon/.test(t))
      console.log(`  [${name}] ${t.slice(0, 110)}`);
  });
  return page;
}

const clickJoin = (p) =>
  p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /join|start|continue/i.test(b.innerText),
    );
    btn?.click();
    return btn ? btn.innerText.trim() : null;
  });
const bodyText = (p) => p.evaluate(() => document.body.innerText);

console.log(`room=${CODE}`);
const alice = await newDevice(A_ID, "Alice QA", "en");
await alice.goto(
  `${BASE}/call/${CODE}?lang=en&host=true&hostLang=es&name=Alice%20QA&pd=${B_ID}&pn=Bruno%20QA`,
  { waitUntil: "networkidle2", timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 3000));
console.log("alice join:", await clickJoin(alice));

const bruno = await newDevice(B_ID, "Bruno QA", "es");
await bruno.goto(
  `${BASE}/call/${CODE}?lang=es&host=false&hostLang=en&name=Bruno%20QA&pd=${A_ID}&pn=Alice%20QA`,
  { waitUntil: "networkidle2", timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 3000));
console.log("bruno join:", await clickJoin(bruno));
await new Promise((r) => setTimeout(r, 12000));

const pre = await bodyText(alice);
const preConnected = /live translating|00:/i.test(pre);
console.log(`pre-interruption connected: ${preConnected ? "✅" : `❌ (${pre.slice(0, 80)})`}`);

// Plant the no-reload marker
await alice.evaluate(() => {
  window.__ez_marker = "alive";
});

// ── THE INTERRUPTION: freeze alice like iOS does during a phone call ────────
console.log(`freezing alice ${FREEZE_MS / 1000}s (simulated native call)…`);
const cdp = await alice.createCDPSession();
await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
await new Promise((r) => setTimeout(r, FREEZE_MS));
await cdp.send("Page.setWebLifecycleState", { state: "active" });
console.log("thawed — firing resume signals");
await alice
  .evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
  })
  .catch(() => {});

// ── Watch for recovery ──────────────────────────────────────────────────────
let recovered = false;
let recoveredAt = 0;
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const txt = await bodyText(alice).catch(() => "");
  if (/live translating/i.test(txt) && !/reconnecting/i.test(txt)) {
    recovered = true;
    recoveredAt = i + 1;
    break;
  }
}
const marker = await alice
  .evaluate(() => window.__ez_marker || "")
  .catch(() => "");
const inPlace = marker === "alive";
const aliceTxt = (await bodyText(alice).catch(() => "")).slice(0, 120).replace(/\n+/g, " | ");

// Bruno should regain Alice
let partnerBack = false;
for (let i = 0; i < 20 && recovered; i++) {
  const bt = await bodyText(bruno).catch(() => "");
  if (/alice/i.test(bt) || !/waiting for partner/i.test(bt)) {
    partnerBack = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log("\n══════ RESULTS ══════");
console.log(`connected before interruption : ${preConnected ? "✅" : "❌"}`);
console.log(`auto-recovered after thaw     : ${recovered ? `✅ (${recoveredAt}s)` : "❌"}`);
console.log(`in-place (NO reload needed)   : ${inPlace ? "✅" : `❌ (marker='${marker}')`}`);
console.log(`partner restored on far side  : ${partnerBack ? "✅" : "❌"}`);
console.log(`alice final: ${aliceTxt}`);
const pass = preConnected && recovered && inPlace && partnerBack;
console.log(pass ? "ALL PASS" : "FAILURES PRESENT");

// Cleanup QA rows
const del = (owner, contact) =>
  fetch(`${BASE}/api/contacts`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerDeviceId: owner, contactDeviceId: contact }),
  }).catch(() => {});
await del(A_ID, B_ID);
await del(B_ID, A_ID);

await browser.close();
process.exit(pass ? 0 : 1);
