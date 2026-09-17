import puppeteer from "puppeteer-core";
// Reproduce the reviewer flow: iPad Air 11" viewport + native-shell UA, fresh
// install, try voice translation on home + f2f. Two passes: mic denied
// (headless default) and mic granted (fake media).
const UA = "Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const BASE = "https://www.entrevoz.co";

async function run(label, extraArgs) {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--autoplay-policy=no-user-gesture-required", ...extraArgs],
  });
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1180, height: 820 }); // iPad Air 11 landscape-ish; try portrait too later
  const errors = [];
  page.on("console", (m) => { const t = m.text(); if (/error|denied|failed/i.test(t) && !/net::|favicon/.test(t)) errors.push(t.slice(0,120)); });
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise(r=>setTimeout(r,3500));
  // dismiss onboarding if shown
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(b=>/get started|start/i.test(b.innerText)); b?.click(); });
  await new Promise(r=>setTimeout(r,1200));
  // skip name modal if shown
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(b=>/skip|later/i.test(b.innerText)); b?.click(); });
  await new Promise(r=>setTimeout(r,800));
  await page.screenshot({ path: `/tmp/ipad-${label}-home.png` });
  // Tap the big mic (voice translate) on home
  const micClicked = await page.evaluate(() => {
    const btns=[...document.querySelectorAll("button")];
    const mic=btns.find(b=>/🎤|mic/i.test(b.innerText)||/mic/i.test(b.getAttribute("aria-label")||""));
    if(mic){mic.click();return mic.innerText.slice(0,30)||mic.getAttribute("aria-label");}
    return null;
  });
  await new Promise(r=>setTimeout(r,4000));
  const bodyAfterMic = await page.evaluate(()=>document.body.innerText);
  await page.screenshot({ path: `/tmp/ipad-${label}-mic.png` });
  // Any visible error-ish text?
  const vis = bodyAfterMic.match(/[^\n]*?(error|denied|not allowed|failed|couldn.t|unable|blocked|isn't on)[^\n]*/gi) || [];
  console.log(`[${label}] micClicked=${micClicked}`);
  console.log(`[${label}] visible error-ish lines:`, JSON.stringify(vis.slice(0,6), null, 1));
  console.log(`[${label}] console errors:`, JSON.stringify(errors.slice(0,6), null, 1));
  // Also try face-to-face
  await page.goto(BASE + "/face-to-face", { waitUntil: "networkidle2", timeout: 45000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,3000));
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(b=>/start|begin|continue/i.test(b.innerText)); b?.click(); });
  await new Promise(r=>setTimeout(r,3500));
  const f2f = await page.evaluate(()=>document.body.innerText);
  const f2fErr = f2f.match(/[^\n]*?(error|denied|not allowed|failed|couldn.t|unable|blocked)[^\n]*/gi) || [];
  await page.screenshot({ path: `/tmp/ipad-${label}-f2f.png` });
  console.log(`[${label}] f2f error-ish:`, JSON.stringify(f2fErr.slice(0,6), null, 1));
  await browser.close();
}
await run("denied", []);
await run("granted", ["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]);
