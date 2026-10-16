// ASO screenshot generator — captures the live redesigned UI at iPhone 6.7"
// App Store spec (1290x2796) and composes marketing caption bands on top.
// Outputs EN + ES sets → /tmp/ev-aso/{en,es}/NN-name.png
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const OUT = "/tmp/ev-aso";
mkdirSync(`${OUT}/raw`, { recursive: true });
mkdirSync(`${OUT}/en`, { recursive: true });
mkdirSync(`${OUT}/es`, { recursive: true });

// 6.7" portrait: 1290x2796 = 430x932 @3x
const VW = 430, VH = 932;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
);
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem("entrevoz_onboarding_complete", "true");
    localStorage.setItem("voxxo_onboarding_complete", "true");
    localStorage.setItem("entrevoz_name_prompted", "1");
    localStorage.setItem("entrevoz_name", "Phil");
    localStorage.setItem("los_device_id", "walkthru-demo-device-01");
    localStorage.setItem("entrevoz_ai_consent", "granted:2026-10-15T00:00:00.000Z");
  } catch {}
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const go = async (u, s = 2800) => { await page.goto(`${BASE}${u}`, { waitUntil: "domcontentloaded", timeout: 25000 }); await sleep(s); };
const tapText = async (t, s = 1200) => {
  await page.evaluate((x) => {
    const el = [...document.querySelectorAll("button, a")].find((e) => e.textContent.trim().toLowerCase().includes(x.toLowerCase()));
    el?.scrollIntoView({ block: "center" }); el?.click();
  }, t); await sleep(s);
};
const shot = async (name) => { await page.screenshot({ path: `${OUT}/raw/${name}.png` }); console.log("raw:", name); };

// ── RAW CAPTURES ─────────────────────────────────────────────────────────────
// 1. Home (calls-first)
await go("/", 3200); await shot("home");

// 2. Live call + captions (lobby → join → injected caption exchange)
const room = "ASOSHT" + Math.floor(Math.random() * 9 + 1);
await go(`/call/${room.slice(0, 6)}?host=true&name=Phil&lang=en&partnerLang=es`, 1500);
await tapText("Join with Video", 3500);
await page.evaluate(() => {
  const wrap = document.createElement("div");
  wrap.className = "space-y-1.5";
  wrap.style.cssText = "position:fixed;bottom:96px;left:10px;right:10px;z-index:60";
  document.body.appendChild(wrap);
  const cap = (side, name, orig, trans, color) => {
    const d = document.createElement("div");
    d.className = `flex ${side === "l" ? "justify-start" : "justify-end"}`;
    d.innerHTML = `<div class="max-w-[95%]"><div class="bg-black/80 backdrop-blur-md rounded-lg px-3 py-2">
      <p class="text-white/70 text-xs leading-snug"><span class="${color} font-medium">${name}</span> ${orig}</p>
      <p class="text-white font-medium leading-snug mt-0.5 text-base">${trans}</p></div></div>`;
    wrap.appendChild(d);
  };
  cap("l", "María", "¿Dónde nos encontramos esta noche?", "Where should we meet tonight?", "text-purple-400");
  cap("r", "You", "Let's do the plaza at eight", "Hagamos la plaza a las ocho", "text-[#00C896]");
});
await sleep(900); await shot("call");

// 3. Dial (code + QR)
await go("/dial", 3000); await shot("dial");

// 4. Contacts (seeded María/João)
await go("/contacts", 3000); await shot("contacts");

// 5. VoxType with real translation
await go("/", 2600); await tapText("Translate", 1400);
await page.click("textarea").catch(() => {});
await page.type("textarea", "Can't wait to finally meet your family", { delay: 25 }).catch(() => {});
await sleep(3800); await shot("voxtype");

// 6. Wingman
await go("/", 2200); await tapText("Tools", 2000); await shot("wingman");

await browser.close();

// ── COMPOSE: caption band + device frame-less full-bleed ─────────────────────
const CAPTIONS = {
  en: {
    home: ["Call anyone.", "They hear their language."],
    call: ["Live translated captions", "on real video calls"],
    dial: ["Share your code once —", "anyone can call you"],
    contacts: ["One tap.", "Their phone rings."],
    voxtype: ["Type it. Verify it.", "Send it anywhere."],
    wingman: ["AI coaching", "whispered in your AirPods"],
  },
  es: {
    home: ["Llama a quien sea.", "Escuchan su idioma."],
    call: ["Subtítulos traducidos en vivo", "en videollamadas reales"],
    dial: ["Comparte tu código una vez —", "cualquiera puede llamarte"],
    contacts: ["Un toque.", "Su teléfono suena."],
    voxtype: ["Escríbelo. Verifícalo.", "Envíalo donde sea."],
    wingman: ["Coaching con IA", "susurrado en tus AirPods"],
  },
};
const ORDER = ["home", "call", "dial", "contacts", "voxtype", "wingman"];

const b2 = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--no-sandbox"],
});
const cp = await b2.newPage();
await cp.setViewport({ width: 1290, height: 2796, deviceScaleFactor: 1 });
for (const lang of ["en", "es"]) {
  for (let i = 0; i < ORDER.length; i++) {
    const key = ORDER[i];
    const [l1, l2] = CAPTIONS[lang][key];
    const html = `<!doctype html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{width:1290px;height:2796px;background:radial-gradient(130% 70% at 50% 0%,#103127 0%,#071311 38%,#04070a 100%);
        font-family:-apple-system,'SF Pro Display',Inter,system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column;align-items:center}
      .cap{margin-top:120px;text-align:center;padding:0 90px}
      .cap h1{color:#fff;font-size:92px;font-weight:800;letter-spacing:-2px;line-height:1.08}
      .cap h1 em{font-style:normal;background:linear-gradient(90deg,#00E5A0,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
      .shotwrap{margin-top:90px;border-radius:64px;overflow:hidden;border:3px solid rgba(255,255,255,.14);
        box-shadow:0 60px 140px rgba(0,0,0,.65), 0 0 120px rgba(0,229,160,.12);width:1120px}
      .shotwrap img{width:100%;display:block}
    </style></head><body>
      <div class="cap"><h1>${l1}<br><em>${l2}</em></h1></div>
      <div class="shotwrap"><img src="data:image/png;base64,${readFileSync(`${OUT}/raw/${key}.png`).toString("base64")}"></div>
    </body></html>`;
    await cp.setContent(html, { waitUntil: "load", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 400));
    await cp.screenshot({ path: `${OUT}/${lang}/${String(i + 1).padStart(2, "0")}-${key}.png` });
    console.log(`composed ${lang}/${i + 1}-${key}`);
  }
}
await b2.close();
console.log("DONE →", OUT);
