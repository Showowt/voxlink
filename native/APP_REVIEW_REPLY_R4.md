# Reply to App Review — Sep 21 rejection (5.1.1(i) / 5.1.2(i), submission 4a09c1ce)

Paste the text between the lines into "Reply to App Review" in App Store
Connect. The same text goes into App Review Information → Notes on the
resubmission, with the consent-screen screenshots attached.

---

Hello, and thank you for the review.

We found the gap you saw: if a user dismissed our AI consent screen, the
Translate → Type tab could still send typed text for translation. That is
fixed, and consent is now enforced for the whole app, not per screen. Our app
loads its interface from our servers, so build 1.0.0 (10) already includes
every change below — no new binary was needed.

1. What is sent, and to whom — shown before anything is sent.
On first launch the app shows an "Allow AI translation?" screen that lists
each type of data and who receives it:
- Recordings of your voice → OpenAI (Whisper), speech-to-text
- Words you type or speak, with recent lines of the conversation → Anthropic
  (Claude), Google Translate, MyMemory, LibreTranslate — translation
- Messages sent in Practice and Wingman → Anthropic (Claude) — AI tutor and
  coach replies
- Translated text, plus short voice samples only if the user turns on Voice
  Mimic → ElevenLabs — spoken voice
- Live call audio and video → Daily.co — video call connection (not AI)

2. Permission before sharing.
The screen has two buttons, "Allow" and "Don't Allow". Nothing is sent to
any of these services until the user taps Allow. This is enforced at one
point in the app that every such request passes through, so it covers every
feature (typed and voice translation, Face-to-Face, calls, Practice,
Wingman). If the user taps Don't Allow and later uses a translation feature,
the permission screen appears again, and the data is sent only if they then
tap Allow.

3. Users stay in control.
Profile → Account & Privacy → AI Data Sharing shows the current choice and
lets the user turn it off or allow it at any time.

4. Privacy policy (https://www.entrevoz.co/privacy), updated September 24,
2026. It states what data the app collects and how (section 2), every use
of that data (section 3), and every third party it is shared with, including
each AI service (section 4). It also confirms that each of these third parties
gives the data the same or equal protection as our policy.

To verify: install fresh → the "Allow AI translation?" screen appears → tap
Don't Allow → open Translate → Type and enter text. The permission screen
appears again and nothing is translated or sent until you tap Allow.
Screenshots are attached.

Demo account (unchanged): reviewer@entrevoz.co / EntrevozDemo2026! — sign in
via the Profile tab. Face-to-Face works on a single device without an account.

Thank you!

---

## Attachments (appStoreReviewAttachments on review detail 97cada7f)
- consent-sheet-ipad.png — first-launch "Allow AI translation?" screen
- consent-reprompt-ipad.png — Type tab after Don't Allow: sheet re-appears, nothing sent
- ai-data-sharing-ipad.png — Profile → Account & Privacy → AI Data Sharing control
