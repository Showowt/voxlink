import puppeteer from "puppeteer-core";

// Verifies the Apple 3.1.1 / 2.3.6 fix on production:
// the native shell (EntrevozApp UA) must show NO paid-tier surfaces on /auth
// or the signed-in /dashboard, while the web (Safari UA) is unchanged.
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NATIVE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/22A3354 Safari/604.1";
const DEMO_EMAIL = "reviewer@entrevoz.co";
const DEMO_PASS = "EntrevozDemo2026!";
const BASE = process.env.BASE || "https://www.entrevoz.co";

const PAID_WORDS = [
  "7-day free trial",
  "free trial on Pro",
  "days left in your trial",
  "Today's usage",
  "Upgrade to Pro",
  "Upgrade now",
  "Trial (",
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().includes(t),
    );
    if (el) el.click();
    return !!el;
  }, text);

async function newPage(ua) {
  // Isolate each test in its own context so sign-in sessions don't bleed
  // across pages (a shared cookie jar would auto-redirect the 2nd test).
  const ctx = await (browser.createBrowserContext?.() ??
    browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  await page.setUserAgent(ua);
  await page.setViewport({ width: 390, height: 844 });
  page._ctx = ctx;
  return page;
}
const closePage = async (page) => {
  const ctx = page._ctx;
  await page.close();
  if (ctx) await ctx.close();
};

async function authText(ua, label) {
  const page = await newPage(ua);
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(2500);
  await clickByText(page, "Sign Up"); // switch to signup mode
  await sleep(600);
  const text = await page.evaluate(() => document.body.innerText);
  const hits = PAID_WORDS.filter((w) => text.includes(w));
  console.log(
    `AUTH/${label}: createFree=${text.includes("Create your free account")} trialCopy=${text.includes("7-day free trial") || text.includes("free trial on Pro")} paidHits=[${hits.join(", ")}]`,
  );
  await closePage(page);
}

async function dashboardText(ua, label) {
  const page = await newPage(ua);
  await page.goto(`${BASE}/auth?next=/dashboard`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await sleep(2000);
  // default mode is Sign In — fill and submit
  await page.evaluate(
    (email, pass) => {
      const ins = [...document.querySelectorAll("input")];
      const em = ins.find((i) => i.type === "email");
      const pw = ins.find((i) => i.type === "password");
      if (em) {
        em.value = "";
        em.focus();
      }
    },
    DEMO_EMAIL,
    DEMO_PASS,
  );
  await page.type('input[type="email"]', DEMO_EMAIL, { delay: 15 });
  await page.type('input[type="password"]', DEMO_PASS, { delay: 15 });
  // Enter in the password field triggers handleSubmit (the "Sign In" tab and the
  // submit button share the same label, so clicking by text hits the tab).
  await page.focus('input[type="password"]');
  await page.keyboard.press("Enter");
  // wait for redirect to /dashboard + content to render
  try {
    await page.waitForFunction(
      () => location.pathname === "/dashboard",
      { timeout: 15000 },
    );
  } catch {
    console.log(`DASH/${label}: DID NOT REACH /dashboard (url=${page.url()})`);
    const t = await page.evaluate(() => document.body.innerText);
    console.log(`   err text: ${t.slice(0, 200)}`);
    await closePage(page);
    return;
  }
  await sleep(3500); // let spinner resolve + content paint
  const text = await page.evaluate(() => document.body.innerText);
  const hits = PAID_WORDS.filter((w) => text.includes(w));
  console.log(
    `DASH/${label}: reached=/dashboard modes=${text.includes("Your modes")} lock=${text.includes("🔒")} planWords=[Pro:${text.includes("Pro")} Trial:${text.includes("Trial")} Free:${text.includes("Free")}] paidHits=[${hits.join(", ")}]`,
  );
  await closePage(page);
}

await authText(SAFARI_UA, "safari");
await authText(NATIVE_UA, "native");
await dashboardText(SAFARI_UA, "safari");
await dashboardText(NATIVE_UA, "native");

await browser.close();
