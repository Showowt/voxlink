import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NATIVE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const BASE = process.env.BASE || "https://www.entrevoz.co";
const DEMO_EMAIL = "reviewer@entrevoz.co";
const DEMO_PASS = "EntrevozDemo2026!";

// errors that are expected in headless Chrome (no mic/cam, no TURN) — NOT app bugs
const BENIGN = [
  /getUserMedia/i, /NotAllowedError/i, /NotFoundError/i, /permission/i,
  /microphone|camera|audio|mediaDevices/i, /not allowed by the user agent/i,
  /AudioContext|autoplay/i, /wss?:\/\//i, /turn:|stun:|ICE|peerjs|metered|daily/i,
  /Requested device not found/i, /favicon/i, /ResizeObserver loop/i,
  /net::ERR_INTERNET_DISCONNECTED/i, /beacon|analytics|gtag|plausible/i,
  /Failed to load because no supported source/i, /play\(\) request/i,
  /speechSynthesis|SpeechRecognition/i,
];
const isBenign = (s) => BENIGN.some((re) => re.test(s));
const CRASH = [
  /Minified React error/i, /Application error/i, /client-side exception/i,
  /Something went wrong/i, /Unhandled Runtime Error/i, /Cannot read propert/i,
  /is not a function/i, /is not defined/i, /Hydration failed/i,
];

const ROUTES = [
  ["/", "home", false],
  ["/auth", "auth", false],
  ["/dashboard", "dashboard", true],
  ["/account", "account", true],
  ["/settings", "settings", true],
  ["/history", "history", true],
  ["/recordings", "recordings", true],
  ["/proximity", "proximity", true],
  ["/face-to-face", "face-to-face", false],
  ["/wingman", "wingman", true],
  ["/group", "group-home", true],
  ["/contacts", "contacts", true],
  ["/language-os", "language-os", false],
  ["/language-os/es-en-US", "los-lesson", false],
  ["/language-os/es-en-US/review", "los-review", false],
  ["/privacy", "privacy", false],
  ["/terms", "terms", false],
  ["/status", "status", false],
  ["/pricing", "pricing(redirect)", false],
  ["/call/ZZTEST9", "call-guest", false],
  ["/talk/ZZTEST9", "talk-guest", false],
  ["/group/ZZTEST9", "group-guest", false],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setUserAgent(NATIVE_UA);
await page.setViewport({ width: 390, height: 844 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bucket = { console: [], pageerror: [], netfail: [], http4xx5xx: [] };
page.on("console", (m) => {
  if (m.type() === "error") bucket.console.push(m.text());
});
page.on("pageerror", (e) => bucket.pageerror.push(String(e.message || e)));
page.on("requestfailed", (r) =>
  bucket.netfail.push(`${r.failure()?.errorText} ${r.url()}`),
);
page.on("response", (r) => {
  if (r.status() >= 400)
    bucket.http4xx5xx.push(`${r.status()} ${r.url()}`);
});

// sign in once (session persists on this page)
await page.goto(`${BASE}/auth?next=/dashboard`, { waitUntil: "networkidle2", timeout: 30000 });
await sleep(1500);
await page.type('input[type="email"]', DEMO_EMAIL, { delay: 12 });
await page.type('input[type="password"]', DEMO_PASS, { delay: 12 });
await page.focus('input[type="password"]');
await page.keyboard.press("Enter");
try {
  await page.waitForFunction(() => location.pathname === "/dashboard", { timeout: 15000 });
  console.log("SIGN-IN: ok\n");
} catch {
  console.log(`SIGN-IN: FAILED (url=${page.url()})\n`);
}

const report = [];
for (const [path, label, auth] of ROUTES) {
  bucket = { console: [], pageerror: [], netfail: [], http4xx5xx: [] };
  let final = "", len = 0, crashHit = [], realConsole = [], real4xx = [];
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2500);
    final = new URL(page.url()).pathname;
    const text = await page.evaluate(() => document.body.innerText || "");
    len = text.length;
    const allText = [...bucket.console, ...bucket.pageerror, text].join("\n");
    crashHit = CRASH.filter((re) => re.test(allText)).map((re) => re.source);
    realConsole = [...bucket.console, ...bucket.pageerror].filter((s) => !isBenign(s));
    real4xx = bucket.http4xx5xx.filter(
      (s) => !/\.(png|jpg|svg|ico|woff|mp3|wav)/i.test(s) && !isBenign(s),
    );
  } catch (e) {
    crashHit = ["NAV_ERROR: " + String(e.message).slice(0, 80)];
  }
  const bounced = auth && final === "/auth";
  const blank = len < 40 && !final.startsWith("/auth");
  const verdict =
    crashHit.length || blank ? "❌ FAIL" : realConsole.length || real4xx.length ? "⚠️  WARN" : "✅ OK";
  report.push(
    `${verdict}  ${label.padEnd(18)} ${path} -> ${final}  len=${len}` +
      (bounced ? " [auth-bounce]" : "") +
      (blank ? " [BLANK]" : "") +
      (crashHit.length ? `\n     CRASH: ${crashHit.join(" | ")}` : "") +
      (realConsole.length ? `\n     console: ${realConsole.slice(0, 4).join(" || ").slice(0, 300)}` : "") +
      (real4xx.length ? `\n     http: ${real4xx.slice(0, 4).join(" | ").slice(0, 300)}` : ""),
  );
}
console.log(report.join("\n"));
await browser.close();
