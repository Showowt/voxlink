import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

// App Store screenshots: 6.9" iPhone portrait = 1320x2868 (440x956 @3x).
// Captured against production with the native-shell UA so what Apple sees
// matches the in-app experience. Fake camera/mic keep call UIs alive.
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const NATIVE_UA =
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

const SHOTS = [
  { path: "/", name: "01-home", settle: 6000 },
  { path: "/face-to-face", name: "02-face-to-face", settle: 6000 },
  { path: "/group", name: "03-group", settle: 6000 },
  { path: "/language-os", name: "04-language-os", settle: 6000 },
  { path: "/talk", name: "05-talk", settle: 6000 },
];

for (const shot of SHOTS) {
  const page = await browser.newPage();
  await page.setUserAgent(NATIVE_UA);
  await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 3 });
  try {
    await page.goto(`https://www.entrevoz.co${shot.path}`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await new Promise((r) => setTimeout(r, shot.settle));
    await page.screenshot({ path: `${OUT}${shot.name}.png` });
    console.log(`captured ${shot.name} (${page.url()})`);
  } catch (err) {
    console.log(`FAILED ${shot.name}: ${err.message}`);
  }
  await page.close();
}

await browser.close();
