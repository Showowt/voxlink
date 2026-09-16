import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// LIVE "X JUST JOINED" LOOP E2E against production:
// The INVITER's app is open (home, ring listener mounted). The invitee claims
// the invite on a second device. Assert the celebration banner appears LIVE on
// the inviter's screen and its "Call now" button navigates into a call room.
// usage: node native/e2e-joined-banner-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://www.entrevoz.co";
const ts = Date.now().toString().slice(-12);
const PHIL_ID = `e2ej1000-0000-4000-8000-${ts}`;
const MOM_ID = `e2ej2000-0000-4000-8000-${ts}`;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required"],
});

async function newDevice(deviceId, name, lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument(
    (id, n, l) => {
      localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_name", n);
      localStorage.setItem("entrevoz_lang", l);
      localStorage.setItem("entrevoz_name_prompted", "true");
      localStorage.setItem("entrevoz_onboarding_complete", "true");
    },
    deviceId,
    name,
    lang,
  );
  return page;
}

let pass = false;
let calledNav = false;

for (let attempt = 1; attempt <= 3 && !pass; attempt++) {
  console.log(`— attempt ${attempt} —`);

  // 1) Create a labeled invite as Phil
  const inv = await fetch(`${BASE}/api/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: PHIL_ID,
      inviterName: "Phil QA",
      inviterLang: "en",
      inviteeLabel: "Mama QA",
    }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (!inv?.inviteCode) {
    console.log("invite create failed; retrying");
    await new Promise((s) => setTimeout(s, 8000));
    continue;
  }
  console.log("invite:", inv.inviteCode);

  // 2) Inviter opens the app (ring listener mounts on home)
  const phil = await newDevice(PHIL_ID, "Phil QA", "en");
  await phil.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise((s) => setTimeout(s, 5000)); // let Realtime channels subscribe

  // 3) Invitee claims through the real page
  const mom = await newDevice(MOM_ID, "", "es");
  await mom.goto(`${BASE}/i/${inv.inviteCode}`, { waitUntil: "networkidle2", timeout: 45000 });
  await new Promise((s) => setTimeout(s, 2000));
  await mom.type('input[placeholder*="know" i]', "Mama Real").catch(() => {});
  await mom.evaluate(() => {
    const es = [...document.querySelectorAll("button")].find((b) => b.innerText.includes("ES"));
    es?.click();
  });
  await mom.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /accept/i.test(b.innerText));
    btn?.click();
  });

  // 4) Watch the inviter's screen for the live banner
  let bannerText = "";
  for (let i = 0; i < 12; i++) {
    await new Promise((s) => setTimeout(s, 1000));
    bannerText = await phil.evaluate(() => document.body.innerText);
    if (/just joined/i.test(bannerText)) break;
  }
  const bannerShown = /just joined/i.test(bannerText);
  const bannerNamed = /Mama Real just joined/i.test(bannerText);
  console.log(`banner shown live: ${bannerShown ? "✅" : "❌"}`);
  console.log(`banner names invitee: ${bannerNamed ? "✅" : "❌"}`);

  if (bannerShown) {
    // 5) Tap "Call now" → should land in a /call room
    await phil.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        /call .*now/i.test(b.innerText),
      );
      btn?.click();
    });
    await new Promise((s) => setTimeout(s, 3500));
    calledNav = phil.url().includes("/call/");
    console.log(`"Call now" navigated to room: ${calledNav ? "✅" : "❌"} (${phil.url()})`);
    pass = bannerShown && bannerNamed && calledNav;
  }

  await phil.browserContext().close().catch(() => {});
  await mom.browserContext().close().catch(() => {});
  if (!pass) await new Promise((s) => setTimeout(s, 10000)); // deploy propagation
}

console.log(`\n${pass ? "ALL PASS" : "FAILURES PRESENT"}`);

// Cleanup contact rows
const del = (owner, contact) =>
  fetch(`${BASE}/api/contacts`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerDeviceId: owner, contactDeviceId: contact }),
  }).catch(() => {});
await del(PHIL_ID, MOM_ID);
await del(MOM_ID, PHIL_ID);

await browser.close();
process.exit(pass ? 0 : 1);
