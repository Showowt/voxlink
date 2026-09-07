# Entrevoz — App Store Submission Pack

Bundle ID: `co.entrevoz.app` · Vercel: voxlink-v14 · Web: https://www.entrevoz.co

## Listing

**Name:** Entrevoz
**Subtitle (30 chars max):** `Live voice translation calls`
**Primary category:** Social Networking · **Secondary:** Travel

**Keywords (100 chars max):**
`translate,translator,voice,video call,spanish,english,conversation,interpreter,traductor,llamada`

### Description (EN)

Speak your language. They hear theirs.

Entrevoz translates your voice in real time — in video calls, group calls,
and face-to-face conversations. No typing, no copy-paste, no awkward pauses.

• VIDEO CALLS — Talk to anyone in 31 languages with live translated captions.
• FACE-TO-FACE — Hand your phone across the table; both sides see their own language.
• GROUP CALLS — Up to 4 people, each speaking and reading their own language.
• VOICE NOTES — Record, transcribe, and translate voice messages instantly.
• LEARN AS YOU GO — Every conversation builds your personal vocabulary.

Your conversations stay yours: delete your data and account anytime, right in the app.

### Description (ES)

Habla tu idioma. Ellos escuchan el suyo.

Entrevoz traduce tu voz en tiempo real — en videollamadas, llamadas grupales
y conversaciones cara a cara. Sin escribir, sin copiar y pegar, sin pausas incómodas.

• VIDEOLLAMADAS — Habla con cualquier persona en 31 idiomas con subtítulos traducidos en vivo.
• CARA A CARA — Pasa tu teléfono; cada lado ve su propio idioma.
• LLAMADAS GRUPALES — Hasta 4 personas, cada una hablando y leyendo su idioma.
• NOTAS DE VOZ — Graba, transcribe y traduce mensajes de voz al instante.
• APRENDE MIENTRAS HABLAS — Cada conversación construye tu vocabulario personal.

Tus conversaciones son tuyas: borra tus datos y tu cuenta cuando quieras, desde la app.

## URLs

- Privacy Policy: https://www.entrevoz.co/privacy
- Support: https://www.entrevoz.co
- Marketing: https://www.entrevoz.co

## App Privacy (nutrition labels)

Data collected, linked to identity:
- **Contact info → Email address** (app functionality: account)
- **User content → Audio data / Other user content** (app functionality: transcription + translation; history/recordings features)
- **Identifiers → User ID** (app functionality)
- **Usage data → Product interaction** (analytics: streaks, session stats)

Not collected: location, contacts (address book), browsing history, purchases (in-app), advertising data. No third-party advertising. No tracking across apps → **no ATT prompt needed**.

## Age rating

4+ (communication between users the person already knows; no unrestricted web access — WebView is pinned to entrevoz.co; no UGC discovery feed).

## Review notes (paste into App Review Information)

> Entrevoz is a real-time voice translation app. Camera and microphone are
> required for its core features (translated video calls and voice transcription).
>
> EASIEST WAY TO TEST WITHOUT A SECOND DEVICE: log in, open "Face-to-Face"
> mode, choose English ↔ Spanish, and speak — the app transcribes and
> translates live on one device.
>
> Demo account: reviewer@entrevoz.co / [SET PASSWORD — see checklist]
>
> Subscriptions are not sold inside the iOS app. The app is fully usable on
> the free tier; premium features are account-level and not purchasable in-app.

## Pre-submission checklist

- [x] Demo account CREATED Sep 7 via live signup: `reviewer@entrevoz.co` / `EntrevozReview2026!` (script: native/create-review-account.mjs)
- [ ] BLOCKED on Phil: account shows "Email not confirmed" — confirm the user in Supabase dashboard (Auth → Users → reviewer@entrevoz.co → Confirm email), then re-run `node native/create-review-account.mjs reviewer@entrevoz.co 'EntrevozReview2026!'` to verify SUCCESS
- [ ] Verify the demo account can run Face-to-Face mode
- [ ] Consider marking the demo account Pro in Supabase so all modes are reviewable
- [ ] Screenshots: 6.9" (1320×2868) required; 6.5" (1242×2688) optional-but-recommended — capture dashboard, video call, face-to-face, language selector
- [ ] Verify /privacy page mentions account deletion + audio processing
- [ ] Version 1.0, build 1 — increment build number on every TestFlight upload

## Native shell notes

- Guideline 4.8: "Continue with Google" is hidden inside the shell (email/password only), so Sign in with Apple is not required for v1. If Google login is ever shown in-app, Sign in with Apple must ship alongside it (AuthModal.tsx has an unused Apple handler; Supabase Apple provider is NOT configured).

- `capacitor.config.ts` points the WKWebView at https://www.entrevoz.co and appends `EntrevozApp/1.0` to the UA; `hooks/useIsNativeApp.ts` keys on this to hide purchase surfaces (Guideline 3.1.1)
- Camera/mic permission strings live in `ios/App/App/Info.plist`; Capacitor auto-grants the WKWebView per-origin media prompt, so users only see the native iOS dialogs
- `ITSAppUsesNonExemptEncryption=false` set — no export-compliance question on upload
- Icon/splash sources: `native/assets/*.svg`, re-render with `node native/assets/render-ios-assets.mjs`
