# Reply to App Review — Sep 17 rejection (2.1a / 5.1.1-5.1.2 / 2.3.6)

Paste this into "Reply to App Review" in App Store Connect (the same text is
already in the App Review notes on the resubmission, submission 4a09c1ce):

---

Hello, and thank you for the detailed review. All three issues have been
addressed. Our app loads its interface from our servers, so build 1.0.0 (10)
already contains every fix — no new binary was needed.

**1. Guideline 2.1(a) — voice translation error.** We reproduced the exact
issue on an iPad Air 11" configuration: when Siri & Dictation are disabled on
the device (common on review devices), the operating system's speech service
reports "service-not-allowed", and the app previously showed an error
notification. The app now detects this automatically and switches to our own
Whisper speech-to-text pipeline, so voice translation works normally with no
error and no settings changes. To verify: open Home → Voice tab → tap the
microphone and speak, or open Face-to-Face → tap either microphone and speak.
The translation appears regardless of the device's Siri/Dictation setting.

**2. Guidelines 5.1.1(i) / 5.1.2(i) — third-party AI data sharing.** On first
launch — before any data is transmitted — the app now presents a consent sheet
that discloses exactly what is sent and to whom:
- Spoken words (audio + transcript) → OpenAI, for speech-to-text
- Typed & spoken words → Anthropic Claude, for translation
- Short voice clips → ElevenLabs, only if the user enables voice output/Voice
  Mimic (optional)
- Live call audio/video → Daily.co, for the call connection

The user must tap "Agree & Continue" before any AI feature transmits data.
Choosing "Not now" keeps the app browsable, and every AI feature re-presents
the consent sheet until permission is granted. Our privacy policy
(https://www.entrevoz.co/privacy, section 4) identifies each processor, the
data sent, the purpose, and the deletion path (Settings → Clear All Data, and
Account → Delete My Account). This data is used solely to provide translation
— never sold and never used for advertising.

**3. Guideline 2.3.6 — Age Rating.** Updated: "Parental Controls" and
"Age Assurance" are now set to None, matching the app (it contains neither).

Demo account (unchanged): reviewer@entrevoz.co / EntrevozDemo2026! — sign in
via the Profile tab. Face-to-Face works single-device without an account.

Thank you!
