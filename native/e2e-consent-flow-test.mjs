import puppeteer from "puppeteer-core";
// App Review 5.1.1(i)/5.1.2(i) consent flow — the positive paths the leak
// audit (native/audit-ai-consent.mjs) can't see:
//   A. first launch: sheet names every recipient, explicit Allow / Don't Allow
//   B. Privacy Policy link: policy readable (sheet not covering it), sheet
//      returns on the way back
//   C. chokepoint: after "Don't Allow", a direct fetch to an AI route from
//      page context is answered 451 locally and never reaches the network
//   D. just-in-time: typing in the Type tab while declined opens the sheet
//      and holds the request; "Allow" releases it and the translation lands
//   E. Account & Privacy → AI Data Sharing: turn off / review & allow
//   F. Spanish toggle
//
//   BASE=https://www.entrevoz.co node native/e2e-consent-flow-test.mjs

const BASE = process.env.BASE || "https://www.entrevoz.co";
const UA =
  "Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";
const SHEET = '[aria-label="AI translation consent"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await (await browser.createBrowserContext()).newPage();
await page.setUserAgent(UA);
await page.setViewport({ width: 820, height: 1180, isMobile: true, hasTouch: true });

const aiRequests = [];
page.on("request", (req) => {
  if (/\/api\/(translate|transcribe|language-os\/chat|cyrano|voice-dub)/.test(req.url())) {
    aiRequests.push({ url: req.url(), at: Date.now() });
  }
});

const sheetOpen = () => page.$(SHEET).then(Boolean);
const bodyText = () => page.evaluate(() => document.body.innerText);
const consent = () => page.evaluate(() => localStorage.getItem("entrevoz_ai_consent"));
async function click(re, scope = "body") {
  return page.evaluate(
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
}

// ── A. First launch ─────────────────────────────────────────────────────────
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2500);
check("A1 sheet shown on first launch", await sheetOpen());
const sheetText = await page.$eval(SHEET, (e) => e.innerText).catch(() => "");
const recipients = ["OpenAI", "Anthropic", "Google Translate", "MyMemory", "LibreTranslate", "ElevenLabs", "Daily.co"];
const missing = recipients.filter((r) => !sheetText.includes(r));
check("A2 sheet names every recipient", missing.length === 0, missing.length ? "missing " + missing.join(", ") : "");
check("A3 explicit Allow / Don't Allow", /\bAllow\b/.test(sheetText) && /Don.t Allow/.test(sheetText));
check("A4 nothing sent before a decision", aiRequests.length === 0, `${aiRequests.length} requests`);

// ── B. Privacy Policy link ──────────────────────────────────────────────────
await click(/^Privacy Policy$/, SHEET);
await sleep(2500);
const onPolicy = page.url().includes("/privacy");
const policy = await bodyText();
check("B1 policy opens from the sheet", onPolicy);
check("B2 sheet does not cover the policy", !(await sheetOpen()));
check(
  "B3 policy names AI recipients + equal protection",
  /OpenAI/.test(policy) && /Anthropic/.test(policy) && /Equal protection/.test(policy) && /Google Translate/.test(policy),
);
await click(/Back to Entrevoz/);
await sleep(2500);
check("B4 sheet returns after reading the policy", await sheetOpen());

// ── C. Chokepoint after "Don't Allow" ───────────────────────────────────────
await click(/^Don.t Allow$/, SHEET);
await sleep(500);
check("C1 decline stored", /^declined:/.test((await consent()) || ""));
const before = aiRequests.length;
const probe = await page.evaluate(async () => {
  const r = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "probe", sourceLang: "en", targetLang: "es" }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
});
await sleep(800);
check("C2 direct AI fetch blocked locally (451)", probe.status === 451 && probe.body?.consentRequired === true, `status ${probe.status}`);
check("C3 blocked fetch never hit the network", aiRequests.length === before);

// ── D. Just-in-time consent in the Type tab ─────────────────────────────────
// Outside the post-decline quiet window, an AI request re-asks.
await sleep(16000);
await page.evaluate(() => {
  document.getElementById("app-scroll")?.scrollTo(0, 0);
});
await click(/^Translate$/);
await sleep(300);
await click(/Type/);
await sleep(700);
const input = await page.$("textarea");
if (input) {
  await input.click();
  await input.type("Good morning, where is the station?", { delay: 20 });
}
await sleep(1500);
check("D1 typing while declined re-opens the sheet", await sheetOpen());
const heldCount = aiRequests.length;
check("D2 request held while the sheet is open", heldCount === before);
await click(/^Allow$/, SHEET);
await sleep(5000);
check("D3 Allow releases the held translation", aiRequests.length > heldCount, `${aiRequests.length - heldCount} sent`);
const typeText = await bodyText();
check("D4 no permission error after Allow", !/needs your permission/.test(typeText));

// ── E. Account & Privacy toggle ─────────────────────────────────────────────
await page.goto(BASE + "/account", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(1500);
let acct = await bodyText();
check("E1 AI Data Sharing card shows Allowed", /AI Data Sharing/.test(acct) && /Allowed/.test(acct));
await click(/Turn Off AI Data Sharing/);
await sleep(600);
acct = await bodyText();
check("E2 Turn Off → Off + stored declined", /Off · Desactivado/.test(acct) && /^declined:/.test((await consent()) || ""));
await click(/Review & Allow/);
await sleep(600);
check("E3 Review & Allow opens the sheet", await sheetOpen());
await click(/^Allow$/, SHEET);
await sleep(600);
acct = await bodyText();
check("E4 Allow → Allowed + stored granted", /Allowed · Permitido/.test(acct) && /^granted:/.test((await consent()) || ""));

// ── F. Spanish ──────────────────────────────────────────────────────────────
await page.evaluate(() => localStorage.removeItem("entrevoz_ai_consent"));
await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2000);
await click(/^Español$/, SHEET);
await sleep(300);
const es = await page.$eval(SHEET, (e) => e.innerText).catch(() => "");
check("F1 Spanish sheet", /¿Permitir traducción con IA\?/.test(es) && /No permitir/.test(es));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
