import puppeteer from "puppeteer-core";

// Creates the Apple review demo account through the live signup form,
// then verifies immediate sign-in (fails if email confirmation is required).
const EMAIL = process.argv[2] ?? "reviewer@entrevoz.co";
const PASSWORD = process.argv[3];
if (!PASSWORD) {
  console.error("usage: node create-review-account.mjs <email> <password>");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
});
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 956 });
await page.goto("https://www.entrevoz.co/auth", {
  waitUntil: "networkidle2",
  timeout: 45000,
});

// Switch to Sign Up tab
const tabs = await page.$$("button");
for (const t of tabs) {
  const label = await t.evaluate((el) => el.innerText.trim());
  if (label === "Sign Up") {
    await t.click();
    break;
  }
}
await new Promise((r) => setTimeout(r, 800));

await page.type('input[placeholder="Your name"]', "Apple Reviewer");
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);

// Submit — exact label so the "Sign Up" mode tab is never matched
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")];
  const submit = buttons.find(
    (b) => b.innerText.trim() === "Create Account",
  );
  submit?.click();
});
await new Promise((r) => setTimeout(r, 6000));

const afterSignup = page.url();
const bodyText = await page.evaluate(() => document.body.innerText);
console.log(`after-signup url=${afterSignup}`);
if (/error|already registered|invalid/i.test(bodyText)) {
  console.log(`page text: ${bodyText.slice(0, 300)}`);
}

// Fresh page: prove the credentials sign in cleanly
const p2 = await browser.newPage();
await p2.goto("https://www.entrevoz.co/auth", {
  waitUntil: "networkidle2",
  timeout: 45000,
});
await p2.type('input[type="email"]', EMAIL);
await p2.type('input[type="password"]', PASSWORD);
await p2.evaluate(() => {
  // Both the mode tab and the submit button say "Sign In" — the submit is
  // the full-width one rendered after the inputs, i.e. the LAST match.
  const buttons = [...document.querySelectorAll("button")].filter((b) =>
    /^sign in$/i.test(b.innerText.trim()),
  );
  buttons[buttons.length - 1]?.click();
});
await new Promise((r) => setTimeout(r, 6000));
const signinText = await p2.evaluate(() => document.body.innerText);
console.log(
  `sign-in result url=${p2.url()} ${p2.url().includes("/dashboard") ? "SUCCESS" : "NOT-CONFIRMED-OR-FAILED"}`,
);
if (!p2.url().includes("/dashboard")) {
  console.log(`sign-in page text: ${signinText.slice(0, 400)}`);
}

await browser.close();
