// THE test that reproduces the REAL failure: callee ASLEEP (socket dead) when
// the caller dials, then wakes. Broadcast alone drops the ring; store-and-
// forward must deliver it via HTTP pull on foreground. Also tests the raw
// persistence API directly so a failure is unambiguous.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const log = (...a) => console.log(`[${new Date().toISOString().slice(14, 19)}]`, ...a);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; log("✅", m); } else { fail++; log("❌", m); } };

// ── Part 1: raw API — persistence works even with NO browser listener at all
const devX = "sf-callee-" + Math.random().toString(36).slice(2, 10);
const room1 = "SF" + Math.random().toString(36).slice(2, 6).toUpperCase();
let r = await fetch(`${BASE}/api/ring/send`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ room: room1, toAddress: devX, fromDevice: "sf-caller-1", fromName: "Caller", fromLang: "en", type: "video", targetLang: "es" }),
});
ok(r.ok, "ring/send accepted");
await new Promise((z) => setTimeout(z, 800));
r = await fetch(`${BASE}/api/ring/pending?addresses=${devX}`);
let body = await r.json();
ok(body.ringing?.some((i) => i.room === room1), "pending returns the stored invite (no live socket needed)");
ok(body.ringing?.[0]?.fromName === "Caller", "invite carries caller identity");

// cancel propagates to pull
await fetch(`${BASE}/api/ring/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: room1, toAddress: devX, fromDevice: "sf-caller-1" }) }); // keep it
await fetch(`${BASE}/api/ring/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: room1, toAddress: devX, status: "canceled" }) });
await new Promise((z) => setTimeout(z, 500));
body = await (await fetch(`${BASE}/api/ring/pending?addresses=${devX}`)).json();
ok(!body.ringing?.some((i) => i.room === room1), "canceled invite no longer ringing");
ok(body.canceled?.includes(room1), "cancel surfaced to pull so a shown ring dismisses");

// ── Part 2: real browser callee — asleep (hidden/offline) at dial, then wakes
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const callee = (await b.createBrowserContext());
const A = await callee.newPage();
await A.setViewport({ width: 390, height: 844, isMobile: true });
const devA = "sf-real-callee-" + Math.random().toString(36).slice(2, 8);
await A.evaluateOnNewDocument((d) => { try { localStorage.setItem("entrevoz_onboarding_complete", "true"); localStorage.setItem("entrevoz_name_prompted", "1"); localStorage.setItem("entrevoz_name", "Esposa"); localStorage.setItem("los_device_id", d); localStorage.setItem("entrevoz_ai_consent", "granted:2026-10-15T00:00:00.000Z"); } catch {} }, devA);
await A.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await new Promise((z) => setTimeout(z, 3000));

// Callee goes to sleep: hidden + offline (socket dies, like a locked iPhone)
await A.evaluate(() => Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }));
await A.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await A.setOfflineMode(true);
log("callee asleep (hidden + offline)");

// Caller dials while callee is asleep — pure store-and-forward write
const room2 = "SF" + Math.random().toString(36).slice(2, 6).toUpperCase();
await fetch(`${BASE}/api/ring/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room: room2, toAddress: devA, fromDevice: "sf-caller-2", fromName: "Phil", fromLang: "en", type: "video", targetLang: "es" }) });
log("caller dialed while callee asleep");
await new Promise((z) => setTimeout(z, 2000));

// Callee WAKES: online + visible → the pull on foreground must find the invite
await A.setOfflineMode(false);
await A.evaluate(() => Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true }));
await A.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
log("callee woke — waiting for ring via HTTP pull");

let rang = false;
for (let i = 0; i < 10; i++) {
  await new Promise((z) => setTimeout(z, 1000));
  rang = await A.evaluate(() => /incoming|is calling|te llama|llamada entrante|Phil/i.test(document.body.innerText));
  if (rang) break;
}
ok(rang, "ASLEEP-AT-DIAL callee RINGS after waking (store-and-forward via HTTP pull)");
await b.close();

// cleanup test rows
log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
