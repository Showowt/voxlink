// E2E: simulate iOS suspend — kill the callee's network briefly (websocket
// dies), restore it, then ring. If the listener never re-subscribes, the
// ring vanishes = the phone looks open but is deaf.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"] });
const seedFor = (name, dev) => `try { localStorage.setItem("entrevoz_onboarding_complete","true"); localStorage.setItem("entrevoz_name_prompted","1"); localStorage.setItem("entrevoz_name","${name}"); localStorage.setItem("los_device_id","${dev}"); localStorage.setItem("entrevoz_ai_consent","granted:2026-10-15T00:00:00.000Z"); } catch {}`;
const devA = "e2esus-aaaa-4000-8000-000000000001";
const devB = "e2esus-bbbb-4000-8000-000000000002";

const ctxA = await b.createBrowserContext();
const A = await ctxA.newPage();
await A.setViewport({ width: 390, height: 844, isMobile: true });
await A.evaluateOnNewDocument(seedFor("Ana", devA));
await A.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 3500));
const codeA = await A.evaluate(() => document.body.innerText.match(/([A-Z2-9]{3}-[A-Z2-9]{3})/)?.[1]?.replace("-", "") || "");
console.log("A code:", codeA);
await A.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 3000));

// ☠️ simulate suspend: cut network 8s (websocket dies), then restore
await A.setOfflineMode(true);
await new Promise(r => setTimeout(r, 8000));
await A.setOfflineMode(false);
console.log("A: network cut 8s and restored (websocket killed)");
await new Promise(r => setTimeout(r, 5000)); // give any auto-reconnect a chance

const ctxB = await b.createBrowserContext();
const B = await ctxB.newPage();
await B.setViewport({ width: 390, height: 844, isMobile: true });
await B.evaluateOnNewDocument(seedFor("Beto", devB));
await B.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 2500));
await B.evaluate((c) => {
  const input = [...document.querySelectorAll("input")].find(i => /code|ABC/i.test(i.placeholder || "")) || document.querySelectorAll("input")[1];
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(input, c); input.dispatchEvent(new Event("input", { bubbles: true }));
}, codeA);
await new Promise(r => setTimeout(r, 800));
await B.evaluate(() => { [...document.querySelectorAll("button")].find(x => /video call/i.test(x.textContent))?.click(); });
await new Promise(r => setTimeout(r, 9000));

const aRing = await A.evaluate(() => /incoming|is calling|te llama|llamada entrante/i.test(document.body.innerText));
console.log("A rings after websocket death+restore:", aRing);
console.log(aRing ? "✅ listener survives socket death" : "❌ CONFIRMED: dead listener after socket drop — phone deaf until full reload");
await b.close();
