// E2E: signup → /pricing → "Start 7-Day Free Trial" → must land on
// checkout.stripe.com. Proves the whole money path (auth, customer create,
// price id, checkout session) against prod.
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const email = `qa-checkout-${Date.now()}@entrevoz.co`;
const password = `Qa!${Date.now()}x`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });

// Signup via the API the auth page uses, then sign in through the UI.
// (Must be on the site origin first — about:blank can't fetch.)
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle2" });
const signup = await page.evaluate(
  async (base, email, password) => {
    const r = await fetch(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "QA Checkout" }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
  BASE, email, password,
);
console.log("signup:", signup.status);

await page.goto(`${BASE}/auth?next=/pricing`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
// Accept the AI-consent sheet if it's overlaying (blocks all clicks).
await page.evaluate(() => {
  const allow = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Allow");
  allow?.click();
});
await new Promise((r) => setTimeout(r, 800));
// Fill the sign-in form.
await page.evaluate((email, password) => {
  const inputs = [...document.querySelectorAll("input")];
  const emailInput = inputs.find((i) => i.type === "email" || /email|correo/i.test(i.placeholder || ""));
  const passInput = inputs.find((i) => i.type === "password");
  const setVal = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  if (emailInput) setVal(emailInput, email);
  if (passInput) setVal(passInput, password);
}, email, password);
await page.evaluate(() => {
  // Two "Sign In" buttons exist: the mode tab (first) and the submit (last).
  const btns = [...document.querySelectorAll("button")].filter((b) =>
    /^sign in$/i.test(b.textContent.trim()),
  );
  btns[btns.length - 1]?.click();
});
await new Promise((r) => setTimeout(r, 4000));
console.log("after signin url:", page.url());

await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /free trial|start 7/i.test(b.textContent),
  );
  if (btn) { btn.click(); return btn.textContent.trim(); }
  return null;
});
console.log("clicked:", clicked);

// Wait for redirect to Stripe.
let landed = "";
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  landed = page.url();
  if (landed.includes("checkout.stripe.com")) break;
}
console.log("final url:", landed.slice(0, 80));
console.log(landed.includes("checkout.stripe.com") ? "✅ CHECKOUT PATH WORKS END-TO-END" : "❌ did not reach Stripe checkout");

if (!landed.includes("checkout.stripe.com")) {
  // Diagnose: call the checkout API directly from the authed page context.
  const direct = await page.evaluate(async () => {
    const r = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "pro", interval: "month" }),
    });
    return { status: r.status, body: await r.text() };
  });
  console.log("direct checkout API:", direct.status, direct.body.slice(0, 300));
  const errText = await page.evaluate(() => document.body.innerText.match(/.{0,120}(error|unavailable|try again).{0,60}/i)?.[0] || "(no visible error)");
  console.log("page error text:", errText);
}

// Does the checkout page show the right price + trial?
if (landed.includes("checkout.stripe.com")) {
  await new Promise((r) => setTimeout(r, 3000));
  const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log("--- stripe page excerpt ---");
  console.log(text);
}

await browser.close();
