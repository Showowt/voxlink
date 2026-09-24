import puppeteer from "puppeteer-core";
// Screenshots of the AI-consent flow for App Review attachments, on the
// reviewer's device profile (iPad Air 11", native-shell UA, 2x).
//
//   BASE=https://www.entrevoz.co OUT=native/screenshots/review node native/capture-consent-shots.mjs
import fs from "node:fs";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const OUT = process.env.OUT || "native/screenshots/review";
const UA =
  "Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const SHEET = '[aria-label="AI translation consent"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await (await browser.createBrowserContext()).newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("entrevoz_lang", "en");
  localStorage.setItem("entrevoz_onboarding_complete", "true");
  localStorage.setItem("entrevoz_name_prompted", "true");
});

const click = (re, scope = "body") =>
  page.evaluate(
    (src, sc) => {
      const rx = new RegExp(src, "i");
      const root = document.querySelector(sc) || document.body;
      const el = [...root.querySelectorAll("button, a")].find(
        (b) => rx.test(b.innerText.trim()) && b.offsetParent !== null,
      );
      el?.click();
      return Boolean(el);
    },
    re.source,
    scope,
  );

// 1. First launch
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(3000);
if (!(await page.$(SHEET))) throw new Error("consent sheet not shown on first launch");
await page.screenshot({ path: `${OUT}/consent-sheet-ipad.png` });

// 2. Don't Allow → Type tab → the sheet re-appears before anything is sent
await click(/^Don.t Allow$/, SHEET);
await sleep(16000); // past the post-decline quiet window
await click(/^Translate$/);
await sleep(300);
await click(/Type/);
await sleep(800);
const input = await page.$("textarea");
if (!input) throw new Error("Type tab textarea not found");
await input.click();
await input.type("Where is the train station?", { delay: 25 });
await sleep(1800);
if (!(await page.$(SHEET))) throw new Error("sheet did not re-appear on the Type tab");
await page.screenshot({ path: `${OUT}/consent-reprompt-ipad.png` });
await click(/^Don.t Allow$/, SHEET);

// 3. Account & Privacy → AI Data Sharing
await page.goto(BASE + "/account", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
await page.evaluate(() => document.getElementById("app-scroll")?.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/ai-data-sharing-ipad.png` });

await browser.close();
console.log(`saved 3 screenshots to ${OUT}`);
