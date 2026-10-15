# ENTREVOZ — The Marketing Bible
*Everything the app actually does, and how to sell it. Grounded in a full code audit at main `8cf7c68` — every claim here is true in production today.*

---

## THE ONE-LINER

**Entrevoz lets two people who don't share a language have a real conversation — live, in their own voices, in 31 languages.**

Elevator version: *You call your mother-in-law in Medellín. You speak English. She hears you — in Spanish, in YOUR voice. She answers in Spanish. You read and hear her in English. Nobody downloaded anything. That's Entrevoz.*

---

## WHAT THE APP ACTUALLY IS (complete, plain language)

A real-time translation communication platform with **four ways to talk, two ways to translate without a call, three ways to connect people, an AI social coach, and a language-learning engine that feeds off your real conversations.**

### The four call modes
1. **Video Call** — face-to-face video with live translated captions both ways. Optional spoken translation: natural AI voices in all 31 languages, or **Voice Mimic** — the translation spoken in *your own cloned voice* (samples auto-delete within ~2 hours).
2. **Talk (audio)** — voice call with a running bilingual transcript feed; speak your language, they read+hear theirs.
3. **Group Call (2–4 people)** — the killer spec: a Colombian, an American, and a Brazilian on one call, **each person reads every speaker in their OWN language**. Per-listener translation, not broadcast.
4. **Face-to-Face** — one phone on the table between two people. Split screen, flipped 180° for the person across from you. Taxi drivers, hotel desks, dates, markets. No network partner needed.

### Translation without a call
5. **VoxType** — type → instant translation → **back-translation verification** (shows you what your message actually says in their language, flags meaning drift ⚠️). Copy/share anywhere — built for WhatsApp.
6. **VoxNote** — record a voice note → transcript → translation → plays aloud. The WhatsApp-voice-note use case for mixed-language families.

### Connecting people (no phone numbers, no accounts required)
7. **Dial Codes** — your personal readable code (like AB-CD-EF). Share it once; anyone can call you.
8. **QR codes + in-app scanner** — point camera at someone's code, they're a contact.
9. **Invite links** — send a personal link; when they tap it you're mutual contacts and they can call you instantly. **The other person never needs to install anything — calls work in their browser.**
10. **Contacts with one-tap redial** — saved people, their phone rings with a native-style incoming-call screen, ringtone and all.
11. **Proximity Radar** — AirDrop-style discovery of nearby Entrevoz users (~100m). Travelers, hostels, conferences.

### The AI layer
12. **Wingman** — a coach in your ear during real-life conversations (not just calls). Four modes: **Date, Interview, Hard Talk, Sales**. Output through AirPods whispers, screen-only, or auto-switching based on ambient noise. In 31 languages.
13. **Cyrano in-call coaching** — same four modes live inside calls: suggested responses as you talk.
14. **Cultural Whispers** — real-time cultural context tips based on who you're talking to.
15. **Post-call summaries** — AI recap: key phrases, follow-ups, mood.
16. **Learning Mode + Language OS** — tap any word in live captions to save it; vocabulary from your *real calls* automatically becomes spaced-repetition flashcards and AI practice conversations with personas. Streaks track consistency. (Active pairs today: EN↔ES focus incl. Colombian Spanish; more coming.)

### Quality-of-life that demos well
17. **Call recordings** — saved on-device, replay/download/share.
18. **Translation history** — searchable, favoritable.
19. **Offline phrasebook** — emergency/navigation/food/social phrases pre-translated.
20. **Resilience** — auto-recovery from dropped networks and iOS interruptions; relay hardening built specifically for Colombian networks; mid-call fallbacks for every component (mic denied → type; no premium voice → browser voice).
21. **Privacy architecture** — speech-to-text runs **on-device by default**; conversations are **not stored on our servers** (transcripts live on YOUR device); explicit AI consent flow; GDPR export + delete; no phone number or email required to use it.

### Platforms
- **Web** — entrevoz.co, nothing to install (recipient side especially)
- **iOS** — native app, **App Store approved**, with VoIP-ringing infrastructure
- **PWA** — installable to home screen on Android/desktop
- 31 languages: EN, ES, FR, PT, DE, IT, ZH, JA, KO, AR, RU, HI, NL, PL, TR, VI, TH, ID, UK, EL, HE, SV, CS, RO, HU, FI, LT, DA, NO, MS, FIL

---

## TRUTH GUARDRAILS (claims discipline)

**Safe to claim:** everything above; "no install needed for the other person"; "on-device speech recognition by default"; "we never store your conversations on our servers"; "your voice samples auto-delete"; "works on bad connections."

**Do NOT claim:** end-to-end encryption (not implemented); "audio never leaves your device" (the Whisper *fallback* sends short clips when on-device STT fails — say "on-device first" instead); offline translation (needs internet); cross-device sync of history/contacts (device-based identity).

---

## THE WOW MOMENTS — RANKED FOR VIRALITY

1. **Voice Mimic** — *"She heard my voice speaking Spanish."* The single most shareable fact about this app. Nobody expects it. Every demo should end here.
2. **The grandmother reaction shot** — first real conversation between family members who've never been able to talk. This is emotion, not tech. The camera is on HER face, not the phone.
3. **Group call, three languages, zero confusion** — a visibly impossible thing, shown working in 15 seconds.
4. **"They didn't install anything"** — call a friend's browser from your phone; their jaw drop that it just works.
5. **Face-to-Face on the table** — taxi/market/date scenarios; 10-second demos, infinitely remixable.
6. **Wingman in AirPods** — "an AI whispering the right thing to say on a date in another language." Rage-bait/talkable content; drives comment wars = reach.
7. **Tap a word mid-call → it's in your flashcards** — "the app teaches you the language while you stop needing it."

---

## POSITIONING BY AUDIENCE

### Users (consumer — the viral engine)
- **Segment 1: Mixed-language families & couples** (US↔LatAm core). Pain: a decade of smiling and nodding at family dinners. Message: *"Have the first real conversation with her abuela."* Season: Thanksgiving → Novenas (Dec 16–24) → Christmas → New Year. This is the holiday launch segment.
- **Segment 2: Intercultural daters** — huge creator niche. Wingman + Date Mode content writes itself.
- **Segment 3: Travelers/expats in LatAm** — Face-to-Face + offline phrases + proximity radar.
- Hooks: "Stop using Google Translate on speakerphone." / "Love has a language barrier. We removed it." / "Llama a tu abuela."

### Clients / B2B (MachineMind pipeline synergy)
Hotels, clinics, tour operators, real-estate: front-desk Face-to-Face mode + group calls with clients. Pitch: *"Every staff member speaks every language your guests do."* Sell as per-seat/location licensing — demo in 60 seconds on a phone on the counter. (Fits existing MachineMind hospitality clients: Casa Badillo, concierge services, SV/CO pipeline.)

### Investors
- **Category:** real-time communication + AI voice — not a translation utility, a *relationship platform* (contacts, calls, history = network effects; Language OS = retention; calls = inherently viral two-sided acquisition: **every call recruits the next user**).
- **Traction artifacts that exist today:** live product, approved iOS app, 31 languages, working group translation (hard tech), Voice Mimic (defensible UX), privacy-first architecture (regulatory tailwind), near-zero marginal cost on the free tier (P2P + on-device STT + free translation cascade), Stripe subscription stack built.
- **Moats (Genesis framing):** Data — vocabulary/conversation-pattern graph per user feeding Language OS. Workflow lock-in — contacts + dial codes + history make switching painful. Intelligence layer — Wingman/summaries deepen with use. The cost structure is itself a moat: competitors paying per-minute STT/translation can't match a free tier this generous.
- **Wedge story:** US↔LatAm family corridor first (massive, underserved, emotionally charged, holiday-seasonal), then B2B hospitality through the existing MachineMind client pipeline.

### Commercials (scripts you can shoot now)
1. **"Abuela" (30s, the flagship):** Phone propped at a holiday table. Grandson: "Abuela… I've wanted to say this for ten years." She hears it in Spanish, in his voice. Her hand over mouth. Tagline: *Entrevoz. Every voice, understood.* Spanish-language cut mirrors it.
2. **"The Table" (15s):** Taxi in Cartagena. Phone on the armrest, split screen. Driver and tourist swap life stories. Cut: "No app. No typing. Just talk."
3. **"Three Friends" (15s):** Group call grid — São Paulo, Miami, Bogotá — one joke lands three times in three languages.
4. **"The Whisper" (15s, Wingman):** A date leans in. AirPod close-up. Subtle smile. "Say less. We'll handle the words."

---

## LAUNCH CONTENT SYSTEM (organic-first, zero ad budget)

- **The reaction-cam format** is the whole strategy: real first-conversations, camera on faces. Recruit 10–20 intercultural-couple/family creators with free Premium; they make the flagship content for you.
- **Every call ends in a share artifact** (post-call summary card: "47 minutes. Two languages. One conversation.") — build in Phase 1 of MONETIZATION_PLAN.md.
- **Duet-bait:** post Voice Mimic clips ("this is my voice in Japanese") — a format anyone can copy with their own language pair.
- **Comment-engine content:** Wingman date mode ("is this cheating?") — controversy = distribution.
- CTA in every piece: the invite link ("call anyone — they don't need the app").

---

*Companion docs: MONETIZATION_PLAN.md (pricing/trial/gating), native/APP_STORE.md (store listing).*
