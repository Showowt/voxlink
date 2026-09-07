import puppeteer from "puppeteer-core";

// Two-ended live call test against production: host + guest in isolated
// contexts with fake camera/mic. Verifies lobby → join → P2P connection.
// usage: node native/e2e-call-test.mjs [call|talk]
const MODE = process.argv[2] ?? "call";
// App room codes are exactly 6 chars — the join modal validates length===6
const CODE = `QA${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

async function newPeer(name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 390, height: 844 });
  page.on("console", (m) => {
    const t = m.text();
    if (/error|failed|Failed/i.test(t) && !/favicon|net::/.test(t))
      console.log(`[${name}:console] ${t.slice(0, 160)}`);
  });
  return page;
}

async function clickJoin(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /join|start|continue/i.test(b.innerText),
    );
    if (btn) {
      btn.click();
      return btn.innerText.trim();
    }
    return null;
  });
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

console.log(`room: ${CODE} mode: ${MODE}`);

const hostUrl =
  MODE === "call"
    ? `https://www.entrevoz.co/call/${CODE}?hostLang=en&host=true`
    : `https://www.entrevoz.co/talk/${CODE}?lang=en&host=true`;
const guestUrl =
  MODE === "call"
    ? `https://www.entrevoz.co/call/${CODE}?hostLang=en`
    : `https://www.entrevoz.co/?join=talk&id=${CODE}`;

const host = await newPeer("host");
await host.goto(hostUrl, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
console.log("host lobby click:", await clickJoin(host));
await new Promise((r) => setTimeout(r, 6000));
console.log("host state:", (await bodyText(host)).slice(0, 150).replace(/\n+/g, " | "));

const guest = await newPeer("guest");
await guest.goto(guestUrl, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
console.log("guest url after load:", guest.url());
if (MODE === "talk") {
  // Join modal: name → pick Spanish → Join
  await guest
    .type('input[placeholder*="Name" i]', "QA Guest")
    .catch(() => console.log("guest: no name input found"));
  await guest.evaluate(() => {
    const es = [...document.querySelectorAll("button")].find((b) =>
      b.innerText.includes("ES"),
    );
    es?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const submitted = await guest.evaluate(() => {
    // GlowButton innerText includes its icon ("💬\nJoin") — match the tail
    const join = [...document.querySelectorAll("button")].find((b) =>
      /join$/i.test(b.innerText.trim()),
    );
    join?.click();
    return join ? join.innerText.replace(/\n/g, " ") : "NOT FOUND";
  });
  console.log("guest: submitted join modal via:", submitted);
} else {
  console.log("guest lobby click:", await clickJoin(guest));
}
await new Promise((r) => setTimeout(r, 12000));

const [hostFinal, guestFinal] = await Promise.all([bodyText(host), bodyText(guest)]);
const hostConnected = !/waiting for partner|joining/i.test(hostFinal);
console.log("guest final url:", guest.url());
console.log("host connected:", hostConnected);
console.log("host text:", hostFinal.slice(0, 200).replace(/\n+/g, " | "));
console.log("guest text:", guestFinal.slice(0, 200).replace(/\n+/g, " | "));

// Remote video liveness on both ends
for (const [name, page] of [["host", host], ["guest", guest]]) {
  const videoInfo = await page.evaluate(() =>
    [...document.querySelectorAll("video")].map((v) => ({
      hasStream: !!v.srcObject,
      tracks: v.srcObject ? v.srcObject.getTracks().length : 0,
      playing: !v.paused && v.readyState >= 2,
    })),
  );
  console.log(`${name} videos:`, JSON.stringify(videoInfo));
}

await browser.close();
