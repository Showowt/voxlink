// THE missing e2e: dial by code → callee's overlay rings → callee ACCEPTS →
// callee taps Join → BOTH sides must reach a connected call (remote stream).
// Prior suites verified ring delivery only — this walks the whole chain.
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox","--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--autoplay-policy=no-user-gesture-required"] });
const seedFor = (name, dev, lang) => `try { localStorage.setItem("entrevoz_onboarding_complete","true"); localStorage.setItem("entrevoz_name_prompted","1"); localStorage.setItem("entrevoz_name","${name}"); localStorage.setItem("los_device_id","${dev}"); localStorage.setItem("entrevoz_lang","${lang}"); localStorage.setItem("entrevoz_ai_consent","granted:2026-10-15T00:00:00.000Z"); } catch {}`;
const devA = "e2eacc-aaaa-4000-8000-000000000001"; // callee (Esposa role)
const devB = "e2eacc-bbbb-4000-8000-000000000002"; // caller (Phil role)
const log = (...a) => console.log(`[${new Date().toISOString().slice(14,19)}]`, ...a);

const ctxA = await b.createBrowserContext();
const A = await ctxA.newPage();
await A.setViewport({ width: 390, height: 844, isMobile: true });
await A.evaluateOnNewDocument(seedFor("Esposa", devA, "es"));
A.on("console", m => { const t = m.text(); if (/\[Ring\]|\[Daily\]|error/i.test(t)) log("A:", t.slice(0, 130)); });
await A.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 3500));
const codeA = await A.evaluate(() => document.body.innerText.match(/([A-Z2-9]{3}-[A-Z2-9]{3})/)?.[1]?.replace("-", "") || "");
log("A code:", codeA);
await A.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 2500));

const ctxB = await b.createBrowserContext();
const B = await ctxB.newPage();
await B.setViewport({ width: 390, height: 844, isMobile: true });
await B.evaluateOnNewDocument(seedFor("Phil", devB, "en"));
B.on("console", m => { const t = m.text(); if (/\[Ring\]|\[Daily\]|error/i.test(t)) log("B:", t.slice(0, 130)); });
await B.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 2500));
await B.evaluate((c) => {
  const input = [...document.querySelectorAll("input")].find(i => /code|ABC/i.test(i.placeholder || "")) || document.querySelectorAll("input")[1];
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(input, c); input.dispatchEvent(new Event("input", { bubbles: true }));
}, codeA);
await new Promise(r => setTimeout(r, 700));
await B.evaluate(() => { [...document.querySelectorAll("button")].find(x => /video call/i.test(x.textContent))?.click(); });
log("B dialed. B url soon:", await B.evaluate(() => location.pathname).catch(() => "?"));

// Wait for A's overlay, then ACCEPT
let accepted = false;
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const hasAccept = await A.evaluate(() => !![...document.querySelectorAll("button")].find(x => /accept/i.test(x.getAttribute("aria-label") || "") || /accept/i.test(x.textContent)));
  if (hasAccept) {
    await A.evaluate(() => { ([...document.querySelectorAll("button")].find(x => /accept/i.test(x.getAttribute("aria-label") || "") || /accept/i.test(x.textContent)))?.click(); });
    accepted = true; log("A ACCEPTED at t+" + (i+1) + "s"); break;
  }
}
if (!accepted) { log("❌ A never got the ring"); await b.close(); process.exit(1); }

await new Promise(r => setTimeout(r, 3000));
log("A url after accept:", await A.evaluate(() => location.pathname + location.search).catch(() => "?"));
// A: tap Join with Video in the lobby
await A.evaluate(() => { [...document.querySelectorAll("button")].find(x => /join with video/i.test(x.textContent))?.click(); });
log("A tapped Join");

// Now wait for BOTH to be connected (remote video with live stream)
let result = null;
for (let i = 0; i < 25; i++) {
  await new Promise(r => setTimeout(r, 1500));
  const aVid = await A.evaluate(() => [...document.querySelectorAll("video")].map(v => ({ s: !!v.srcObject, t: v.srcObject ? v.srcObject.getTracks().length : 0, p: !v.paused }))).catch(() => []);
  const bVid = await B.evaluate(() => [...document.querySelectorAll("video")].map(v => ({ s: !!v.srcObject, t: v.srcObject ? v.srcObject.getTracks().length : 0, p: !v.paused }))).catch(() => []);
  const aRemote = aVid.some(v => v.s && v.t >= 1 && v.p);
  const bRemoteCount = bVid.filter(v => v.s && v.t >= 1 && v.p).length;
  if (aRemote && bRemoteCount >= 2) { result = { aVid, bVid, atSec: (i+1)*1.5 }; break; } // B needs local+remote
}
if (result) {
  log("✅ CONNECTED BOTH SIDES in", result.atSec, "s —", JSON.stringify(result.aVid), JSON.stringify(result.bVid));
} else {
  const aTxt = await A.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, " | ")).catch(() => "?");
  const bTxt = await B.evaluate(() => document.body.innerText.slice(0, 200).replace(/\n/g, " | ")).catch(() => "?");
  log("❌ NEVER CONNECTED.");
  log("A state:", aTxt);
  log("B state:", bTxt);
  await A.screenshot({ path: "/tmp/accept-A.png" }).catch(() => {});
  await B.screenshot({ path: "/tmp/accept-B.png" }).catch(() => {});
}
await b.close();
