// UI/navigation audit capture — full-page iPhone-viewport screenshots of every
// main surface on prod, with onboarding pre-completed so we see the real app.
// Usage: node native/audit-ui-screens.mjs   → /tmp/ev-audit/*.png
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const OUT = "/tmp/ev-audit";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox"],
});

const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
);

// Pre-seed: onboarding done, name set, stable device id.
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem("entrevoz_onboarding_complete", "true");
    localStorage.setItem("voxxo_onboarding_complete", "true");
    localStorage.setItem("entrevoz_name_prompted", "1");
    localStorage.setItem("entrevoz_name", "Phil");
    localStorage.setItem("los_device_id", "ui-audit-device-000001");
  } catch {}
});

async function shot(name, url, fn) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1800));
    if (fn) await fn();
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log("✓", name);
  } catch (e) {
    console.log("✗", name, e.message);
  }
}

async function clickText(txt) {
  const clicked = await page.evaluate((t) => {
    const els = [...document.querySelectorAll("button, a")];
    const el = els.find((e) => e.textContent.trim().toLowerCase().includes(t.toLowerCase()));
    if (el) { el.click(); return true; }
    return false;
  }, txt);
  await new Promise((r) => setTimeout(r, 1200));
  return clicked;
}

await shot("01-home-translate", "/");
await shot("02-home-connect", "/", async () => { await clickText("Connect"); });
await shot("03-home-tools", "/", async () => { await clickText("Tools"); });
await shot("04-dial", "/dial");
await shot("05-contacts", "/contacts");
await shot("06-history", "/history");
await shot("07-recordings", "/recordings");
await shot("08-learn", "/language-os");
await shot("09-dashboard-profile", "/dashboard");
await shot("10-group", "/group");
await shot("11-settings", "/settings");
await shot("12-pricing", "/pricing");
await shot("13-wingman", "/wingman");
await shot("14-onboarding", "/", async () => {
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
});

await browser.close();
console.log("done →", OUT);
