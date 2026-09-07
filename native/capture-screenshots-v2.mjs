import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

// App Store screenshot set v2 — authenticated, with Language OS featured.
// 6.9" iPhone portrait: 440x956 @3x = 1320x2868.
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const page = await browser.newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 3 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("captured", name);
};
const clickByText = (re) =>
  page.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const el = [...document.querySelectorAll("button, a, [role=button]")].find(
      (b) => rx.test(b.innerText || ""),
    );
    if (el) {
      el.click();
      return (el.innerText || "").slice(0, 40);
    }
    return null;
  }, re.source);

// ── 1. Sign in as reviewer ──
await page.goto("https://www.entrevoz.co/auth", { waitUntil: "networkidle2", timeout: 45000 });
await page.type('input[type="email"]', "reviewer@entrevoz.co");
await page.type('input[type="password"]', "EntrevozReview2026!");
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].filter((x) => /sign in$/i.test(x.innerText.trim()));
  b[b.length - 1]?.click();
});
await wait(6000);
console.log("signed in:", page.url());

// ── 2. Home ──
await page.goto("https://www.entrevoz.co/", { waitUntil: "networkidle2", timeout: 45000 });
await wait(5000);
await shot("01-home");

// ── 3. Video call host waiting screen (share link visible) ──
await page.goto("https://www.entrevoz.co/call/APPSTR?hostLang=es&host=true&lang=en", { waitUntil: "networkidle2", timeout: 45000 });
await wait(4000);
await clickByText(/join with video/);
await wait(8000);
await shot("02-video-call");

// ── 4. Face-to-face ──
await page.goto("https://www.entrevoz.co/face-to-face", { waitUntil: "networkidle2", timeout: 45000 });
await wait(5000);
await shot("03-face-to-face");

// ── 5. Language OS: seed vocab for this device, then landing ──
await page.goto("https://www.entrevoz.co/language-os", { waitUntil: "networkidle2", timeout: 45000 });
await wait(4000);
const deviceId = await page.evaluate(() => localStorage.getItem("los_device_id"));
console.log("los device:", deviceId);
if (deviceId) {
  await page.evaluate(async (id) => {
    await fetch("/api/language-os/entrevoz-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: id,
        languagePair: "es-en-US",
        transcript: [
          { text: "¿Dónde está la estación del tren?", language: "es" },
          { text: "La estación está cerca del parque central", language: "es" },
          { text: "Muchas gracias parcero, muy amable", language: "es" },
          { text: "Con mucho gusto, que tengas buen viaje", language: "es" },
          { text: "Nos vemos mañana en la fiesta", language: "es" },
        ],
        conversationId: "APPSTR",
        durationSeconds: 300,
      }),
    });
  }, deviceId);
  console.log("vocab seeded");
}
await shot("06-language-os");

// ── 6. Language OS chat: open Colombian Spanish, talk to Carlos ──
console.log("clicked:", await clickByText(/colombian spanish/));
await wait(4000);
await page.type("textarea, input[type=text]", "Hola Carlos, ¿cómo estás?").catch(() => console.log("no chat input"));
await page.keyboard.press("Enter");
await wait(9000); // Claude persona reply
await shot("04-language-os-chat");

// ── 7. Vocab tab (seeded words + SRS) ──
console.log("vocab tab:", await clickByText(/^vocab$/));
await wait(3500);
await shot("05-vocab");

// ── 8. Group call landing ──
await page.goto("https://www.entrevoz.co/group", { waitUntil: "networkidle2", timeout: 45000 });
await wait(4500);
await shot("07-group");

await browser.close();
console.log("done");
