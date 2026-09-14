# App Review Reply — v1.0.0 build 10 — Guidelines 3.1.1 & 2.3.6

Paste the text below into **"Reply to App Review"** in the Resolution Center,
and also into **App Review Notes**. Then resubmit (no new build required — see
"How to resubmit" at the bottom).

---

## Reply text (paste verbatim)

Hello, and thank you for the review.

Entrevoz is a free app. We have confirmed and, where needed, corrected the app
so that it contains **no in-app purchases and no paid content or features**, and
does not reference any subscription, trial, upgrade, or "Pro" tier anywhere in
the app.

**Regarding Guideline 3.1.1 (In-App Purchase):**
There is no way to make a purchase inside the app, and no functionality is
locked behind a purchase. Every feature — real-time translated video calls,
Face-to-Face mode, group calls, voice notes, and the Language OS practice
tools — is fully available to every user at no cost. The app does not use any
alternative purchase mechanism, and it does not display any price, subscription,
trial, upgrade prompt, or purchase call-to-action. We have removed the account
screen's "free trial" wording and the dashboard's plan/trial/usage-limit and
"Upgrade" elements. These changes are already live in the running app.

**Regarding Guideline 2.3.6 (Accurate Metadata):**
Our metadata and review notes state that the app is free with no in-app
purchases, and the app now matches that exactly — there are no paid features and
nothing that requires a purchase. The App Store screenshots show only the app's
core features (translation, video call, face-to-face, group call, talk mode,
proximity); none reference pricing or paid tiers.

**How to test:**
- DEMO ACCOUNT: reviewer@entrevoz.co / EntrevozDemo2026!
- Register (Profile tab → Sign Up): account is created instantly and lands in
  the app. No purchase or trial is offered.
- Sign in and open the dashboard: it shows only usage stats and the app's modes
  — no plan, trial, limit, or upgrade UI, and no locked features.
- Easiest single-device test: open **Face-to-Face**, pick two languages
  (e.g. English ↔ Spanish), tap the mic and speak — the app transcribes and
  speaks the translation live, both directions.
- ACCOUNT DELETION: Profile tab → sign in → "Account & Privacy · Delete account"
  → "Delete My Account". This permanently deletes the account and its data.

Please let us know if anything else is needed. Thank you.

---

## Ground truth this reply is based on (verified today on production)

Signed into the demo account under the app's WebView user agent
(`EntrevozApp/1.0`), the dashboard renders with **zero** paid surfaces —
case-insensitive scan for trial / upgrade / subscription / premium / $ /
/month / pricing / unlimited / plan / "today's usage" / "pro " all return false.
All six modes show unlocked (no lock icon). The account-deletion link is present.
On a normal Safari user agent (the website) the paid tiers still appear —
web monetization is unchanged. Verified via `native/verify-iap-gate.mjs`.

## Why no new build is required

Build 10 (1.0.0) is a WKWebView shell that loads the live entrevoz.co
experience. The fixes above are web-side (commit 1b59c47, deployed to
production and Ready), so the already-uploaded build 10 now shows the corrected,
purchase-free UI. Resubmitting build 10 is sufficient.

## How to resubmit (App Store Connect)

1. App Store Connect → Entrevoz → the 1.0.0 version page.
2. Confirm build **1.0.0 (10)** is still attached (it is).
3. Paste the reply text above into **App Review Notes** (replace the old notes).
4. Go to the Resolution Center message for submission `a44600ec` and click
   **Reply**, paste the same text, and submit the reply.
5. Click **Add for Review / Submit for Review** to resubmit the same build.
   (No new binary, no new screenshots needed.)
