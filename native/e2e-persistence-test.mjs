import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE E2E against production: two seeded "devices" (Alice/Bruno) join a
// real /call room with URL-seeded partner identity (pd/pn — as dial/accept now
// send), connect, then leave WITHOUT tapping End (navigate away → pagehide
// backstop). Asserts through the live API that BOTH sides saved the contact
// with the right name AND logged the call to durable history.
// usage: node native/e2e-persistence-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.BASE || "https://www.entrevoz.co";
const CODE = `QA${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const A_ID = "e2e0a000-0000-4000-8000-" + Date.now().toString().slice(-12);
const B_ID = "e2e0b000-0000-4000-8000-" + Date.now().toString().slice(-12);
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22A3354 EntrevozApp/1.0";

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function newDevice(name, deviceId, myName, lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844 });
  // Seed identity BEFORE any page script runs — this is the "device".
  await page.evaluateOnNewDocument(
    (id, n, l) => {
      localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_ai_consent", "granted:test");
      localStorage.setItem("entrevoz_name", n);
      localStorage.setItem("entrevoz_lang", l);
      localStorage.setItem("entrevoz_name_prompted", "true");
    },
    deviceId,
    myName,
    lang,
  );
  page.on("console", (m) => {
    const t = m.text();
    if (/error|failed/i.test(t) && !/favicon|net::|401|403/.test(t))
      console.log(`[${name}] ${t.slice(0, 140)}`);
  });
  return page;
}

const clickJoin = (page) =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /join|start|continue/i.test(b.innerText),
    );
    if (btn) {
      btn.click();
      return btn.innerText.trim();
    }
    return null;
  });

console.log(`room=${CODE}\nA(Alice)=${A_ID}\nB(Bruno)=${B_ID}`);

// Alice dials Bruno (pd/pn seeded, as dial() now sends after directory resolve)
const alice = await newDevice("alice", A_ID, "Alice QA", "en");
await alice.goto(
  `${BASE}/call/${CODE}?lang=en&host=true&hostLang=es&name=${encodeURIComponent("Alice QA")}&pd=${B_ID}&pn=${encodeURIComponent("Bruno QA")}`,
  { waitUntil: "networkidle2", timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 3500));
console.log("alice join:", await clickJoin(alice));

// Bruno accepts (pd/pn seeded, as IncomingCallOverlay.accept now sends)
const bruno = await newDevice("bruno", B_ID, "Bruno QA", "es");
await bruno.goto(
  `${BASE}/call/${CODE}?lang=es&host=false&hostLang=en&name=${encodeURIComponent("Bruno QA")}&pd=${A_ID}&pn=${encodeURIComponent("Alice QA")}`,
  { waitUntil: "networkidle2", timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 3500));
console.log("bruno join:", await clickJoin(bruno));

// Let the call connect (hadPartner must latch for history)
await new Promise((r) => setTimeout(r, 14000));
for (const [n, p] of [["alice", alice], ["bruno", bruno]]) {
  const txt = (await p.evaluate(() => document.body.innerText)).slice(0, 120);
  console.log(`${n} in-call:`, txt.replace(/\n+/g, " | "));
}

// Leave WITHOUT tapping End — navigate away fires pagehide → backstop flush.
await alice.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
await bruno.goto(`${BASE}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
await new Promise((r) => setTimeout(r, 4000));

// ── ASSERT through the live API ─────────────────────────────────────────────
const j = (u) => fetch(u).then((r) => r.json());
const aContacts = await j(`${BASE}/api/contacts?deviceId=${A_ID}`);
const bContacts = await j(`${BASE}/api/contacts?deviceId=${B_ID}`);
const aHist = await j(`${BASE}/api/history?deviceId=${A_ID}`);
const bHist = await j(`${BASE}/api/history?deviceId=${B_ID}`);

const aHasBruno = (aContacts.contacts || []).some(
  (c) => c.contact_device_id === B_ID && c.display_name === "Bruno QA",
);
const bHasAlice = (bContacts.contacts || []).some(
  (c) => c.contact_device_id === A_ID && c.display_name === "Alice QA",
);
const aLogged = (aHist.calls || []).some((c) => c.room_code === CODE);
const bLogged = (bHist.calls || []).some((c) => c.room_code === CODE);

console.log("\n══════ RESULTS ══════");
console.log(`CONTACT  alice saved Bruno QA : ${aHasBruno ? "✅" : "❌"}`);
console.log(`CONTACT  bruno saved Alice QA : ${bHasAlice ? "✅" : "❌"}`);
console.log(`HISTORY  alice logged call    : ${aLogged ? "✅" : "❌"}`);
console.log(`HISTORY  bruno logged call    : ${bLogged ? "✅" : "❌"}`);
if (aLogged) {
  const row = aHist.calls.find((c) => c.room_code === CODE);
  console.log(
    `history row (alice): partner=${row.partner_name} dur=${row.duration_seconds}s pair=${row.language_pair}`,
  );
}
console.log(
  aHasBruno && bHasAlice && aLogged && bLogged ? "ALL PASS" : "FAILURES PRESENT",
);

// Cleanup QA rows
const del = (owner, contact) =>
  fetch(`${BASE}/api/contacts`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerDeviceId: owner, contactDeviceId: contact }),
  }).catch(() => {});
await del(A_ID, B_ID);
await del(B_ID, A_ID);

await browser.close();
process.exit(aHasBruno && bHasAlice && aLogged && bLogged ? 0 : 1);
