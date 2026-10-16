// Guards the likely-Esposa root cause: the CALLER dials an OLD device id (saved
// in their history) while the callee's current id has DRIFTED to a new one.
// The callee must still ring, because it listens + pulls on ALL ids it's used.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const log = (...a) => console.log(`[${new Date().toISOString().slice(14, 19)}]`, ...a);

const oldId = "drift-OLD-" + Math.random().toString(36).slice(2, 8);
const newId = "drift-NEW-" + Math.random().toString(36).slice(2, 8);

const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await b.createBrowserContext();
const A = await ctx.newPage();
await A.setViewport({ width: 390, height: 844, isMobile: true });
// Callee: current id = newId, but it REMEMBERS oldId in los_known_ids (drift).
await A.evaluateOnNewDocument((oldId, newId) => {
  try {
    localStorage.setItem("entrevoz_onboarding_complete", "true");
    localStorage.setItem("entrevoz_name_prompted", "1");
    localStorage.setItem("entrevoz_name", "Esposa");
    localStorage.setItem("los_device_id", newId);
    localStorage.setItem("los_known_ids", JSON.stringify([oldId, newId]));
    localStorage.setItem("entrevoz_ai_consent", "granted:2026-10-15T00:00:00.000Z");
  } catch {}
}, oldId, newId);
await A.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await new Promise((z) => setTimeout(z, 4000));

// Caller dials the OLD id (what their history/contacts stored pre-drift).
const room = "DR" + Math.random().toString(36).slice(2, 6).toUpperCase();
await fetch(`${BASE}/api/ring/send`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ room, toAddress: oldId, fromDevice: "drift-caller", fromName: "Phil", fromLang: "en", type: "video", targetLang: "es" }),
});
log(`caller dialed OLD id ${oldId}; callee current id is ${newId}`);

let rang = false;
for (let i = 0; i < 10; i++) {
  await new Promise((z) => setTimeout(z, 1000));
  rang = await A.evaluate(() => /incoming|is calling|te llama|llamada entrante|Phil/i.test(document.body.innerText));
  if (rang) break;
}
log(rang ? "✅ DRIFTED callee RINGS on its OLD id (listens on all known ids)" : "❌ drifted callee did NOT ring — identity bug");
await b.close();
process.exit(rang ? 0 : 1);
