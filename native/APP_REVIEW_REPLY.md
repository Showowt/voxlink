# Entrevoz — Reply to App Review (Guideline 2.1, Information Needed)

Paste the block below into **"Reply to App Review"** in App Store Connect, and
also paste it into **App Review Information → Notes** (Apple asked for both).
Attach the screen recording (see the shot list at the bottom) to the reply.

---

## REPLY (paste this)

Thank you for reviewing Entrevoz. Please find all requested information below.

**2. App purpose and target audience**

Entrevoz is a real-time voice translation app for conversations between people who
don't share a language. One person speaks, and Entrevoz transcribes their speech
and speaks/writes the translation to the other person in real time, in both
directions, across 31 languages. It's built for travelers, immigrant and mixed-
language families, and everyday cross-language situations (hospitality, healthcare,
retail, business) where two people need to talk naturally but don't speak the same
language. The problem it solves is the awkwardness and friction of translating a
live, back-and-forth conversation; the value is a natural, hands-free conversation
instead of typing into a translator app and passing a phone back and forth.

**3. Setup, access, and demo credentials**

- Demo account (email/password sign-in):
  - Email: reviewer@entrevoz.co
  - Password: EntrevozDemo2026!
- Fastest way to test the core feature on a single device: open **"Face-to-Face"**
  mode. This works on one phone — it listens, transcribes, and translates both
  speakers' turns out loud, so a reviewer can demonstrate the full translation loop
  without a second device. Tap the language for each side, tap the mic, and speak.
- To test a two-person **video/voice call**: start a call, tap **Share / Copy link**,
  and open that link in a second device or a desktop browser to join as the guest;
  the guest picks their language in the lobby, and speech is translated live between
  the two participants.
- No sample files or special configuration are required.

**4. External services used for core functionality**

- Supabase — user authentication (email/password) and data storage.
- OpenAI Whisper — speech-to-text (transcription of spoken audio).
- Anthropic Claude — translation and the in-app language-learning feature.
- MyMemory, LibreTranslate, and Lingva — additional translation providers used as
  layered fallbacks for reliability.
- ElevenLabs — natural text-to-speech for spoken translations (and an optional
  feature that can speak the translation in a voice resembling the speaker's).
- Daily.co — 1:1 video call infrastructure (WebRTC).
- PeerJS with Metered TURN servers — peer-to-peer signaling and relay for
  face-to-face and group calls (WebRTC).

**5. Regional differences**

There are no regional differences. Entrevoz functions consistently across all
regions, and all 31 languages are available everywhere. No content is region-locked.

**6. Regulated industry / protected third-party material**

Not applicable. Entrevoz does not operate in a regulated industry and uses no
protected third-party content. It translates the user's own live speech, using the
standard AI/translation developer services listed in item 4 under their normal terms.

**Additional clarifications for item 1 (screen recording contents)**

- Account registration, login, and deletion: all three are shown in the attached
  recording. Account deletion is available in-app: tap the Profile tab, sign in, then
  tap "Account & Privacy · Delete account" at the bottom of the Profile screen, then
  "Delete My Account". It permanently removes the account and its associated data.
- User-generated content / reporting & blocking: Entrevoz has no public or
  user-generated content feed. Conversations are private and ephemeral and occur only
  between people who directly exchange an invite link — there are no public posts,
  user profiles, or discoverable users — so there is no content library that would
  require reporting/blocking mechanisms.
- Paid content or features: there are no in-app purchases and no paid content or
  features accessible within the app. All functionality is available for free in the
  app, so there is nothing gated to demonstrate.

Thank you — please let us know if anything else would help complete the review.

---

## SCREEN RECORDING — shot list (record on your physical iPhone, latest iOS)

Record with the iOS Screen Recorder (Control Center). ~1–2 min. Do it in one take:

1. **Launch the app from the Home Screen** (start with the icon tap — Apple requires
   the recording to begin at launch).
2. **Register a new account** — tap the Profile tab → Sign Up, enter a name + email +
   password → Create Account. The account is created instantly and you land in the
   app signed in (no email confirmation step). You can use a throwaway email.
3. **Sign in** — (optional, to also show login) sign out, then sign in with the demo
   account reviewer@entrevoz.co / EntrevozDemo2026!.
4. **Show the core feature** — open **Face-to-Face**, pick two languages, tap the mic,
   say a sentence in one language and show it transcribe + speak the translation; then
   the other direction. (This is the "typical user flow.")
5. **(Optional, strengthens it)** start a call and show the **Copy/Share link** so it's
   clear how a second person joins.
6. **Account deletion** — on the Profile screen, scroll to the bottom and tap
   **"Account & Privacy · Delete account"** → then **Delete My Account** and show the
   confirmation. (Apple specifically checks this.)
7. Stop the recording. Attach it to the App Review reply.

No paywall/purchase screen exists, so nothing to record there.
