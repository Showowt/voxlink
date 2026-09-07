import puppeteer from "puppeteer-core";

// Verifies the native-shell UA gating against production:
// - native UA must be redirected off /pricing and never see purchase copy
// - normal Safari UA must see the pricing page
// - homepage must load the app (no access gate)
const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NATIVE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/22A3354 Safari/604.1";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
});

async function probe(ua, path, label) {
  const page = await browser.newPage();
  await page.setUserAgent(ua);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`https://www.entrevoz.co${path}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 4000));
  const url = page.url();
  const text = await page.evaluate(() => document.body.innerText);
  console.log(
    `${label}: final=${url} gate=${text.includes("access code")} pricingCopy=${text.includes("Pick your power")} textLen=${text.length}`,
  );
  await page.close();
}

await probe(SAFARI_UA, "/", "HOME/safari");
await probe(SAFARI_UA, "/pricing", "PRICING/safari");
await probe(NATIVE_UA, "/pricing", "PRICING/native");

await browser.close();
