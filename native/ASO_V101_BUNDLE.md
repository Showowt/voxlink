# Entrevoz v1.0.1 — ASO Bundle (EN + ES)
*2026-10-16 · goal: win brand + category search, convert with redesigned-UI screenshots*

## App name (30 chars max)
- **EN:** `Entrevoz: Live Call Translator` (30)
- **ES:** `Entrevoz: Traductor de Llamadas` → 31, use `Entrevoz: Traduce tus Llamadas` (30)

## Subtitle (30 chars max)
- **EN:** `Video calls in 31 languages` (27)
- **ES:** `Videollamadas en 31 idiomas` (27)

## Keywords (100 chars, comma-separated, no spaces after commas, don't repeat name/subtitle words)
- **EN:** `voice translator,translate call,interpreter,spanish,live captions,speak,family,abroad,phone,chat` (97)
- **ES:** `traductor de voz,llamada,interprete,ingles,subtitulos,hablar,familia,extranjero,telefono,traducir` (98)

## Promotional text (170 chars, live-editable, no review)
- **EN:** `Call anyone — they read and hear you in their language. Live translated captions, your own voice in 31 languages. The other person doesn't even need the app.` (157)
- **ES:** `Llama a quien sea: te leen y escuchan en su idioma. Subtítulos traducidos en vivo y tu propia voz en 31 idiomas. La otra persona ni siquiera necesita la app.` (156)

## What's New (v1.0.1)
- **EN:**
```
• Redesigned home — start a translated video call in one tap
• Call anyone back straight from History
• Names now show correctly in your call history
• Faster, clearer captions during calls
```
- **ES:**
```
• Inicio rediseñado: empieza una videollamada traducida en un toque
• Devuelve llamadas directo desde tu Historial
• Los nombres ahora aparecen correctamente en el historial
• Subtítulos más rápidos y claros durante las llamadas
```

## Screenshots (6.7" — 1290×2796, generated from live redesigned UI)
Order: 1 home · 2 live-call captions · 3 dial code+QR · 4 contacts · 5 VoxType · 6 Wingman
- EN set: `/tmp/ev-aso/en/01..06.png`
- ES set: `/tmp/ev-aso/es/01..06.png`
(Regenerate any time: `node native/aso-screenshots.mjs`)

## Submission state / blocker
- Metadata + screenshots: stage in ASC under version 1.0.1 (browser).
- **BLOCKER: binary.** This Mac has no Xcode, no signing identities, no provisioning
  profiles — the 1.0.0 build was produced elsewhere. Options:
  a) Install Xcode here + Phil signs into his Apple Developer account once →
     `cd ios/App && npx cap sync ios` → bump MARKETING_VERSION to 1.0.1 →
     archive + upload (exportOptions.plist already in repo).
  b) Build on whatever machine produced 1.0.0.
  Submit v1.0.1 once the build appears in ASC.

## Post-submit
- Expect US brand-search rank to fix itself within days of (a) metadata indexing and
  (b) first ratings. Ask the first real users for ratings directly.
- Store listing screenshots will then match the live product.
