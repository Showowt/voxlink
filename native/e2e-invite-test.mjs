import puppeteer from "puppeteer-core";

// ─────────────────────────────────────────────────────────────────────────────
// INVITE-LOOP E2E against production:
// 1) Inviter creates a labeled invite (API) → pending shows in their list.
// 2) A REAL headless invitee opens /i/<code>, types a name, taps Accept.
// 3) Assert: both contact rows exist (label wins on inviter side), invite is
//    claimed, invitee registered in the dial directory (code on the page).
// 4) Manual-add branches: registered code → real id; unknown code → sentinel.
// usage: node native/e2e-invite-test.mjs
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://www.entrevoz.co";
const ts = Date.now().toString().slice(-12);
const PHIL_ID = `e2ei1000-0000-4000-8000-${ts}`;
const MOM_ID = `e2ei2000-0000-4000-8000-${ts}`;
const CARLOS_ID = `e2ei3000-0000-4000-8000-${ts}`;
const j = (u, opt) =>
  fetch(u, opt).then((r) =>
    r
      .json()
      .then((d) => ({ ok: r.ok, status: r.status, d }))
      .catch(() => ({ ok: false, status: r.status, d: null })),
  );
const post = (u, body) =>
  j(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// 1) Create invite (poll until the deploy serves the new route)
let inviteCode = "";
for (let i = 0; i < 40; i++) {
  const r = await post(`${BASE}/api/invite`, {
    deviceId: PHIL_ID,
    inviterName: "Phil QA",
    inviterLang: "en",
    inviteeLabel: "Mama QA",
  });
  if (r.ok && r.d?.inviteCode) {
    inviteCode = r.d.inviteCode;
    break;
  }
  await new Promise((s) => setTimeout(s, 6000));
}
if (!inviteCode) {
  console.log("FAIL: invite route never came up");
  process.exit(1);
}
console.log("invite created:", inviteCode);

const pend = await j(`${BASE}/api/invite?inviterDeviceId=${PHIL_ID}`);
const pendingListed = (pend.d.invites || []).some(
  (i) => i.invite_code === inviteCode && !i.claimed_by_device_id,
);
console.log(`pending listed for inviter: ${pendingListed ? "✅" : "❌"}`);

// 2) Real invitee claims through the actual page
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.evaluateOnNewDocument((id) => {
  localStorage.setItem("los_device_id", id);
      localStorage.setItem("entrevoz_ai_consent", "granted:test");
}, MOM_ID);
await page.goto(`${BASE}/i/${inviteCode}`, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((s) => setTimeout(s, 2500));
const landing = await page.evaluate(() => document.body.innerText);
console.log("landing shows inviter:", landing.includes("Phil QA") ? "✅" : `❌ (${landing.slice(0, 80)})`);

await page.type('input[placeholder*="know" i]', "Mama Real").catch(() => {});
await page.evaluate(() => {
  const es = [...document.querySelectorAll("button")].find((b) => b.innerText.includes("ES"));
  es?.click();
});
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /accept/i.test(b.innerText),
  );
  btn?.click();
});
await new Promise((s) => setTimeout(s, 4000));
const done = await page.evaluate(() => document.body.innerText);
const connected = /are connected/i.test(done);
console.log(`claim page connected: ${connected ? "✅" : `❌ (${done.slice(0, 100)})`}`);
const codeMatch = done.match(/([2-9A-HJ-NP-Z]{3})-([2-9A-HJ-NP-Z]{3})/);
const momCode = codeMatch ? codeMatch[1] + codeMatch[2] : "";
await browser.close();

// 3) Assert the attached graph
const philContacts = await j(`${BASE}/api/contacts?deviceId=${PHIL_ID}`);
const momContacts = await j(`${BASE}/api/contacts?deviceId=${MOM_ID}`);
const philHasMom = (philContacts.d.contacts || []).some(
  (c) => c.contact_device_id === MOM_ID && c.display_name === "Mama QA", // label wins
);
const momHasPhil = (momContacts.d.contacts || []).some(
  (c) => c.contact_device_id === PHIL_ID && c.display_name === "Phil QA",
);
const info = await j(`${BASE}/api/invite?code=${inviteCode}`);
const claimed = info.d?.claimed === true;
let dirOk = false;
if (momCode) {
  const dir = await j(`${BASE}/api/directory?code=${momCode}`);
  dirOk = dir.d?.found && dir.d?.deviceId === MOM_ID;
}

// 4) Manual-add branches
await post(`${BASE}/api/directory`, {
  deviceId: CARLOS_ID,
  dialCode: "QACARL",
  displayName: "Carlos QA",
  language: "es",
});
const res = await j(`${BASE}/api/directory?code=QACARL`);
const addResolved = await post(`${BASE}/api/contacts`, {
  ownerDeviceId: PHIL_ID,
  contactDeviceId: res.d.deviceId,
  displayName: "Carlos Cliente",
  language: res.d.language,
});
const addSentinel = await post(`${BASE}/api/contacts`, {
  ownerDeviceId: PHIL_ID,
  contactDeviceId: "code:ZZZQQQ",
  displayName: "Persona Sin App",
  language: "en",
});
const philAfter = await j(`${BASE}/api/contacts?deviceId=${PHIL_ID}`);
const hasCarlos = (philAfter.d.contacts || []).some((c) => c.display_name === "Carlos Cliente");
const hasSentinel = (philAfter.d.contacts || []).some(
  (c) => c.contact_device_id === "code:ZZZQQQ" && c.display_name === "Persona Sin App",
);

console.log("\n══════ RESULTS ══════");
console.log(`pending invite listed       : ${pendingListed ? "✅" : "❌"}`);
console.log(`claim page → connected      : ${connected ? "✅" : "❌"}`);
console.log(`inviter saved invitee (label "Mama QA") : ${philHasMom ? "✅" : "❌"}`);
console.log(`invitee saved inviter ("Phil QA")       : ${momHasPhil ? "✅" : "❌"}`);
console.log(`invite marked claimed       : ${claimed ? "✅" : "❌"}`);
console.log(`invitee in dial directory   : ${dirOk ? "✅" : "❌"} (code ${momCode || "?"})`);
console.log(`manual add (registered code): ${addResolved.ok && hasCarlos ? "✅" : "❌"}`);
console.log(`manual add (unknown code → dialable sentinel): ${addSentinel.ok && hasSentinel ? "✅" : "❌"}`);
const all = pendingListed && connected && philHasMom && momHasPhil && claimed && dirOk && addResolved.ok && hasCarlos && addSentinel.ok && hasSentinel;
console.log(all ? "ALL PASS" : "FAILURES PRESENT");

// Cleanup
const del = (owner, contact) =>
  fetch(`${BASE}/api/contacts`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerDeviceId: owner, contactDeviceId: contact }),
  }).catch(() => {});
await del(PHIL_ID, MOM_ID);
await del(MOM_ID, PHIL_ID);
await del(PHIL_ID, res.d.deviceId || CARLOS_ID);
await del(PHIL_ID, "code:ZZZQQQ");
process.exit(all ? 0 : 1);
