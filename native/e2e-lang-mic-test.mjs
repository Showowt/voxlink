import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE + MIC-REMINDER E2E against production:
// A) /dial shows the "I speak" selector; picking ES persists app-wide.
// B) A REAL ring: callee's overlay shows the pre-answer "I speak" strip;
//    picking ES + Accept carries lang=es into the room URL.
// C) /talk with mic permission DENIED (headless default): both sides connect
//    (data-only) and the "mic isn't on" reminder appears.
// usage: node native/e2e-lang-mic-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://www.entrevoz.co";
const ts = Date.now().toString().slice(-12);
const CALLER_ID = `e2el1000-0000-4000-8000-${ts}`;
const CALLEE_ID = `e2el2000-0000-4000-8000-${ts}`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  // NOTE: no fake-media flags — mic permission is DENIED by default, which is
  // exactly what part C needs. Ring + talk are data-path and work without it.
  args: ["--autoplay-policy=no-user-gesture-required"],
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
    },
    deviceId,
    name,
    lang,
  );
  return page;
}
const body = (p) => p.evaluate(() => document.body.innerText);

// ── A) /dial language selector ──────────────────────────────────────────────
const caller = await newDevice(CALLER_ID, "Caller QA", "en");
await caller.goto(`${BASE}/dial`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 2500));
const dialTxt = await body(caller);
const dialHasPicker = /I speak/i.test(dialTxt);
await caller.evaluate(() => {
  const es = [...document.querySelectorAll("button")].find((b) =>
    /^\s*🇪🇸\s*ES\s*$/m.test(b.innerText.trim()),
  );
  es?.click();
});
await new Promise((r) => setTimeout(r, 700));
const persisted = await caller.evaluate(() => localStorage.getItem("entrevoz_lang"));
console.log(`A. /dial "I speak" selector    : ${dialHasPicker ? "✅" : "❌"}`);
console.log(`A. picking ES persists         : ${persisted === "es" ? "✅" : `❌ (${persisted})`}`);

// ── B) Pre-answer language on a real ring ───────────────────────────────────
// Callee opens /dial (registers directory + starts ring listener via AppShell)
const callee = await newDevice(CALLEE_ID, "Callee QA", "en");
await callee.goto(`${BASE}/dial`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 5000)); // directory + ring channels up
const calleeCode = await callee.evaluate(() => {
  const m = document.body.innerText.match(/([2-9A-HJ-NP-Z]{3})-([2-9A-HJ-NP-Z]{3})/);
  return m ? m[1] + m[2] : "";
});
console.log(`B. callee code: ${calleeCode || "NOT FOUND"}`);

// Caller dials the code (video)
await caller.evaluate((code) => {
  const input = document.querySelector('input[placeholder="ABC-DEF"]');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, code);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, calleeCode);
await new Promise((r) => setTimeout(r, 400));
await caller.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /video call/i.test(b.innerText),
  );
  btn?.click();
});

// Callee: wait for the ring overlay with the language strip
let overlayTxt = "";
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  overlayTxt = await body(callee).catch(() => "");
  if (/is calling you/i.test(overlayTxt)) break;
}
const rang = /is calling you/i.test(overlayTxt);
const overlayHasPicker = rang && /I speak/i.test(overlayTxt);
console.log(`B. overlay rang                : ${rang ? "✅" : "❌"}`);
console.log(`B. overlay language strip      : ${overlayHasPicker ? "✅" : "❌"}`);

let langCarried = false;
if (rang) {
  // Pick ES on the RING OVERLAY (the /dial page underneath has its own
  // "I speak" strip — scope to the dialog or we click the wrong one)
  await callee.evaluate(() => {
    const overlay = document.querySelector('[role="dialog"]') || document;
    const es = [...overlay.querySelectorAll("button")].find((b) =>
      /^\s*🇪🇸\s*ES\s*$/m.test(b.innerText.trim()),
    );
    es?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await callee.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /accept/i.test(b.innerText),
    );
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const url = callee.url();
  langCarried = url.includes("/call/") && url.includes("lang=es");
  console.log(`B. Accept carries lang=es      : ${langCarried ? "✅" : `❌ (${url})`}`);
}

// ── C) /talk mic reminder with denied permission ────────────────────────────
const TALK = `QL${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const tHost = await newDevice(`e2el3000-0000-4000-8000-${ts}`, "Host QA", "en");
await tHost.goto(`${BASE}/talk/${TALK}?lang=en&host=true&name=Host%20QA`, {
  waitUntil: "networkidle2",
  timeout: 45000,
});
const tGuest = await newDevice(`e2el4000-0000-4000-8000-${ts}`, "Guest QA", "es");
await tGuest.goto(`${BASE}/talk/${TALK}?lang=es&host=false&name=Guest%20QA`, {
  waitUntil: "networkidle2",
  timeout: 45000,
});
// Tap-to-talk: "prompt" alone must NOT nag — the reminder fires on the
// tap-time DENIAL. Tap the big mic button (headless denies the permission).
await new Promise((r) => setTimeout(r, 3000));
await tHost.evaluate(() => {
  const mic = [...document.querySelectorAll("button")].find((b) =>
    b.className.includes("w-20 h-20"),
  );
  mic?.click();
});
let reminder = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const t = await body(tHost).catch(() => "");
  if (/mic isn't on|Microphone is blocked|Enable microphone/i.test(t)) {
    reminder = true;
    break;
  }
}
console.log(`C. /talk mic reminder on denial: ${reminder ? "✅" : "❌"}`);

console.log("\n══════ RESULTS ══════");
const pass = dialHasPicker && persisted === "es" && rang && overlayHasPicker && langCarried && reminder;
console.log(pass ? "ALL PASS" : "FAILURES PRESENT");

// Cleanup QA contacts (dial-out may have saved the callee via directory)
const del = (owner, contact) =>
  fetch(`${BASE}/api/contacts`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerDeviceId: owner, contactDeviceId: contact }),
  }).catch(() => {});
await del(CALLER_ID, CALLEE_ID);
await del(CALLEE_ID, CALLER_ID);

await browser.close();
process.exit(pass ? 0 : 1);
