// Marketing/tutorial walkthrough recorder — ONE continuous screencast of the
// live app with branded title cards rendered inline between sections.
// (Per-segment screencast start/stop wedged puppeteer's CDP pipe — a single
// recording for the whole run is the reliable pattern.)
// Output: /tmp/ev-video/walkthrough-raw.webm → assemble to
// ~/Downloads/entrevoz-walkthrough.mp4 with the printed ffmpeg command.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "https://www.entrevoz.co";
const OUT = "/tmp/ev-video";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
mkdirSync(OUT, { recursive: true });

const VW = 432, VH = 768; // 9:16 — scales cleanly to 1080x1920

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const seed = () => {
  try {
    localStorage.setItem("entrevoz_onboarding_complete", "true");
    localStorage.setItem("voxxo_onboarding_complete", "true");
    localStorage.setItem("entrevoz_name_prompted", "1");
    localStorage.setItem("entrevoz_name", "Phil");
    localStorage.setItem("los_device_id", "walkthru-demo-device-01");
    localStorage.setItem("entrevoz_ai_consent", "granted:2026-10-15T00:00:00.000Z");
  } catch {}
};

let page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
);
await page.evaluateOnNewDocument(seed);

const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) =>
  Promise.race([p, sleep(ms).then(() => { throw new Error(`timeout: ${label}`); })]);
setTimeout(() => { console.log("WATCHDOG: force exit"); process.exit(2); }, 10 * 60 * 1000).unref();

// ── Title card as a same-origin OVERLAY on the live app page ─────────────────
// setContent() cards lived on about:blank; navigating back to the app swapped
// the renderer process and CDP screencast silently stopped emitting frames
// (the video froze on the card). Overlays keep one origin end to end.
async function titleCard(big, small, hold = 2300) {
  await page.evaluate(
    ({ big, small }) => {
      document.getElementById("__ev-card")?.remove();
      const d = document.createElement("div");
      d.id = "__ev-card";
      d.innerHTML = `
        <style>
          #__ev-card{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;
            background:radial-gradient(120% 90% at 50% 0%,#0d1a17 0%,#05070a 55%,#04050a 100%);
            font-family:-apple-system,'SF Pro Display',Inter,system-ui,sans-serif;opacity:0;transition:opacity .45s ease}
          #__ev-card .bar{width:44px;height:4px;border-radius:2px;background:linear-gradient(90deg,#00E5A0,#00DBA8)}
          #__ev-card h1{color:#fff;font-size:34px;line-height:1.15;font-weight:800;text-align:center;max-width:340px;letter-spacing:-0.5px;margin:0}
          #__ev-card h1 em{font-style:normal;background:linear-gradient(90deg,#00E5A0,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
          #__ev-card p{color:rgba(255,255,255,.55);font-size:16px;text-align:center;max-width:320px;line-height:1.45;margin:0}
          #__ev-card .brand{position:absolute;bottom:34px;color:rgba(255,255,255,.35);font-size:12px;letter-spacing:.14em;text-transform:uppercase}
        </style>
        <div class="bar"></div><h1>${big}</h1>${small ? `<p>${small}</p>` : ""}<div class="brand">Entrevoz</div>`;
      document.body.appendChild(d);
      requestAnimationFrame(() => (d.style.opacity = "1"));
    },
    { big, small },
  );
  await sleep(hold);
  await page.evaluate(() => {
    const d = document.getElementById("__ev-card");
    if (d) { d.style.opacity = "0"; setTimeout(() => d.remove(), 460); }
  }).catch(() => {});
  await sleep(500);
  log("card:", big.replace(/<[^>]+>/g, " "));
}

async function section(label, fn, budget = 55000) {
  try {
    await withTimeout(fn(), budget, label);
    log("✓", label);
  } catch (e) {
    log("✗", label, e.message);
  }
}
async function go(url, settle = 2600) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await sleep(settle);
}
async function tapText(txt, settle = 1200) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button, a")].find((e) =>
      e.textContent.trim().toLowerCase().includes(t.toLowerCase()),
    );
    el?.scrollIntoView({ block: "center" });
    el?.click();
  }, txt);
  await sleep(settle);
}
async function smoothScroll(px, steps = 14) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), px / steps);
    await sleep(55);
  }
}

// ═════ ONE CONTINUOUS RECORDING ══════════════════════════════════════════════
// Land on the app origin FIRST so the screencast never crosses a process swap.
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(2500);
const rec = await page.screencast({ path: `${OUT}/walkthrough-raw1.webm`, ffmpegPath: FFMPEG });

await titleCard("Your voice.<br><em>Any language.</em><br>Instantly.", "Real-time translated calls in 31 languages", 2800);

await titleCard("Start a <em>translated video call</em>", "Your name, your language — one tap");
await section("home", async () => {
  await go("/", 3000);
  await tapText("Change", 1600);
  await tapText("Change", 900);
  await sleep(500);
});

await titleCard("They read you — <em>in their language</em>", "Live translated captions, both directions");
await withTimeout(rec.stop(), 10000, "rec1:stop").catch(() => {});
console.log("part1 saved");

// ── CALL SECTION — screenshot loop (screencast freezes on WebRTC pages) ──────
import("node:fs").then(() => {});
const { mkdirSync: mk } = await import("node:fs");
mk(`${OUT}/callframes`, { recursive: true });
let callFrame = 0;
let shooting = false;
async function shootLoop() {
  shooting = true;
  while (shooting) {
    const n = String(callFrame++).padStart(4, "0");
    await page.screenshot({ path: `${OUT}/callframes/f${n}.jpg`, quality: 82, type: "jpeg" }).catch(() => {});
    await sleep(60); // ~8-10fps real due to capture cost
  }
}
const room = "WALKT" + Math.floor(Math.random() * 9 + 1);
const guest = await browser.newPage();
await guest.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true });
await guest.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem("entrevoz_onboarding_complete", "true");
    localStorage.setItem("entrevoz_name_prompted", "1");
    localStorage.setItem("entrevoz_name", "María");
    localStorage.setItem("los_device_id", "walkthru-maria-0001");
    localStorage.setItem("entrevoz_ai_consent", "granted:2026-10-15T00:00:00.000Z");
  } catch {}
});
await section("live-call", async () => {
  await go(`/call/${room}?host=true&name=Phil&lang=en&partnerLang=es`, 1200);
  const loop = shootLoop();
  await sleep(1800);
  log("call url:", page.url());
  await tapText("Join with Video", 2500);
  log("after join tap url:", page.url());
  await guest.goto(`${BASE}/call/${room}?name=Mar%C3%ADa&lang=es`, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
  await sleep(2000);
  await guest.evaluate(() => {
    const el = [...document.querySelectorAll("button")].find((b) => /join with video/i.test(b.textContent));
    el?.click();
  }).catch(() => {});
  await sleep(6500);
  await page.evaluate(() => {
    const wrap = document.createElement("div");
    wrap.className = "space-y-1.5";
    wrap.style.cssText = "position:fixed;bottom:84px;left:8px;right:8px;z-index:60";
    document.body.appendChild(wrap);
    window.__cap = (side, name, orig, trans, color) => {
      const d = document.createElement("div");
      d.className = `flex ${side === "l" ? "justify-start" : "justify-end"}`;
      d.innerHTML = `<div class="max-w-[95%]"><div class="bg-black/80 backdrop-blur-md rounded-lg px-3 py-2">
        <p class="text-white/70 text-xs leading-snug"><span class="${color} font-medium">${name}</span> ${orig}</p>
        <p class="text-white font-medium leading-snug mt-0.5 text-base">${trans}</p></div></div>`;
      wrap.appendChild(d);
      if (wrap.children.length > 2) wrap.removeChild(wrap.firstChild);
    };
  });
  await sleep(700);
  await page.evaluate(() => window.__cap("l", "María", "¿Dónde nos encontramos esta noche?", "Where should we meet tonight?", "text-purple-400"));
  await sleep(3300);
  await page.evaluate(() => window.__cap("r", "You", "Let's do the plaza at eight", "Hagamos la plaza a las ocho", "text-[#00C896]"));
  await sleep(3400);
  shooting = false;
  await loop;
}, 70000);
await guest.close().catch(() => {});
console.log("call frames:", callFrame);

// ── PART 2 — fresh page, fresh screencast ────────────────────────────────────
const page2 = await browser.newPage();
await page2.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page2.setUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
);
await page2.evaluateOnNewDocument(seed);
await page2.goto(`${BASE}/dial`, { waitUntil: "domcontentloaded", timeout: 25000 });
await sleep(2000);
await page.close().catch(() => {});
const takeover = page2; // sections below use `page` via reassignment
// eslint-disable-next-line no-global-assign
page = takeover;
const rec2 = await page2.screencast({ path: `${OUT}/walkthrough-raw2.webm`, ffmpegPath: FFMPEG });

await titleCard("Share your code <em>once</em>", "Anyone can call you — no number, no link");
await section("dial", async () => {
  await go("/dial", 2800);
  await smoothScroll(520);
  await sleep(1400);
});

await titleCard("One tap. <em>Their phone rings.</em>", "People you talk to save automatically");
await section("contacts", async () => {
  await go("/contacts", 2800);
  await sleep(2000);
});

await titleCard("Group calls, <em>four languages at once</em>", "Everyone reads every speaker in their own language");
await section("group", async () => {
  await go("/group", 2800);
  await smoothScroll(340);
  await sleep(1300);
});

await titleCard("One phone <em>between two people</em>", "Taxis, hotels, dinners — just talk");
await section("face-to-face", async () => {
  await go("/face-to-face", 3000);
  await sleep(2400);
});

await titleCard("Type it. <em>Verify it.</em> Send it.", "Back-translation shows exactly what they'll read");
await section("voxtype", async () => {
  await go("/", 2600);
  await tapText("Translate", 1300);
  await page.click("textarea").catch(() => {});
  await page.type("textarea", "Can't wait to finally meet your family", { delay: 55 }).catch(() => {});
  await sleep(3600);
  await smoothScroll(220);
  await sleep(1600);
});

await titleCard("It <em>teaches you</em> while you use it", "Words from your real calls become lessons");
await section("learn", async () => {
  await go("/language-os", 2800);
  await smoothScroll(440);
  await sleep(1400);
});

await titleCard("Your <em>AI wingman</em>", "Live coaching whispered through your AirPods");
await section("wingman", async () => {
  await go("/", 2200);
  await tapText("Tools", 1600);
  await sleep(2200);
});

await titleCard("Every conversation, <em>kept</em>", "Transcripts, translations, recordings");
await section("history", async () => {
  await go("/history", 2800);
  await sleep(2200);
});

await titleCard("<em>Entrevoz</em>", "Free on the App Store &amp; entrevoz.co", 3200);

await withTimeout(rec2.stop(), 15000, "rec2:stop").catch((e) => console.log("stop:", e.message));
await browser.close();
console.log("PARTS:", `${OUT}/walkthrough-raw1.webm`, `${OUT}/callframes (${callFrame})`, `${OUT}/walkthrough-raw2.webm`);
