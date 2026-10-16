// E2E: tonight's exact failure — callee PARKED ON A DEAD CALL SCREEN must
// still RING (old code auto-declined). Full real loop over prod Realtime:
// B dials A's code from /dial; A sits on an abandoned /call lobby.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"] });

const seedFor = (name, dev) => `try { localStorage.setItem("entrevoz_onboarding_complete","true"); localStorage.setItem("entrevoz_name_prompted","1"); localStorage.setItem("entrevoz_name","${name}"); localStorage.setItem("los_device_id","${dev}"); localStorage.setItem("entrevoz_ai_consent","granted:2026-10-15T00:00:00.000Z"); } catch {}`;

const devA = "e2ering-aaaa-4000-8000-000000000001";
const devB = "e2ering-bbbb-4000-8000-000000000002";

// A: register in directory via /dial, read code, then PARK on a dead call screen
const ctxA = await b.createBrowserContext();
const A = await ctxA.newPage();
await A.setViewport({ width: 390, height: 844, isMobile: true });
await A.evaluateOnNewDocument(seedFor("Ana", devA));
await A.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 3500)); // registerDirectory debounce fires
const codeA = await A.evaluate(() => document.body.innerText.match(/([A-Z2-9]{3}-[A-Z2-9]{3})/)?.[1]?.replace("-", "") || "");
console.log("A code:", codeA);
await A.goto(`${BASE}/call/DEADRM9?lang=es`, { waitUntil: "domcontentloaded" }); // dead lobby = old auto-decline trap
await new Promise(r => setTimeout(r, 2500));

// B: dial A's code for real
const ctxB = await b.createBrowserContext();
const B = await ctxB.newPage();
await B.setViewport({ width: 390, height: 844, isMobile: true });
await B.evaluateOnNewDocument(seedFor("Beto", devB));
await B.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 2500));
await B.evaluate((c) => {
  const input = [...document.querySelectorAll("input")].find(i => /code|ABC/i.test(i.placeholder || "") || i.className.includes("mono")) || document.querySelectorAll("input")[1];
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(input, c); input.dispatchEvent(new Event("input", { bubbles: true }));
}, codeA);
await new Promise(r => setTimeout(r, 800));
await B.evaluate(() => { [...document.querySelectorAll("button")].find(x => /video call/i.test(x.textContent))?.click(); });
await new Promise(r => setTimeout(r, 9000));

const aState = await A.evaluate(() => ({
  overlayRinging: /incoming|llamada entrante|is calling|te llama/i.test(document.body.innerText),
  bodyHead: document.body.innerText.slice(0, 150).replace(/\n/g, " | "),
}));
const bState = await B.evaluate(() => ({
  url: location.pathname,
  ringing: /Ringing/i.test(document.body.innerText),
  declined: /declined/i.test(document.body.innerText),
}));
console.log("A (parked on dead call screen):", JSON.stringify(aState));
console.log("B (caller):", JSON.stringify(bState));
console.log(aState.overlayRinging && !bState.declined ? "✅ RING REACHES PARKED DEVICE — no auto-decline" : "❌ still broken");
await b.close();
