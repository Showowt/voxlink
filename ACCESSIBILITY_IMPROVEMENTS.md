# Accessibility Improvements for app/page.tsx

## Overview
This document outlines all semantic HTML and ARIA label improvements needed for App Store compliance.

## Changes Required

### 1. VoxTypeTab Component (Lines 228-436)

**Current:** `<div className="space-y-3 sm:space-y-4">`
**Change to:**
```tsx
<section role="region" aria-labelledby="voxtype-heading" className="space-y-3 sm:space-y-4">
  <h2 id="voxtype-heading" className="sr-only">Type and Translate Mode</h2>
```

**Current:** Header div (line 230)
**Change to:** Add `aria-hidden="true"` since it's decorative

**Current:** `<label className="text-xs...">` (line 250)
**Change to:**
```tsx
<label htmlFor="voxtype-input" className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5 sm:gap-2">
  <span aria-hidden="true">{getFlag(sourceLang)}</span>
```

**Current:** `<textarea value={inputText}...>` (line 254)
**Change to:** Add `id="voxtype-input"` and `aria-label`

**Current:** Error GlassCard (line 269)
**Change to:** Add `role="alert"` and `aria-live="assertive"`

**Current:** Loading div (line 276)
**Change to:** Add `role="status"` and `aria-live="polite"`, add `aria-hidden="true"` to spinner

**Current:** Translation Result div (line 286)
**Change to:**
```tsx
<div className="space-y-1.5 sm:space-y-2" role="region" aria-labelledby="translation-result-label">
  <label id="translation-result-label"...>
```

Add `aria-live="polite"` to translation text paragraph

**Current:** Verification label (line 352)
**Change to:** Add `id="verification-label"` and wrap in region with `aria-labelledby`

**Current:** Meaning match status spans (lines 357-366)
**Change to:** Add `role="status"` and descriptive `aria-label`

**Current:** How it works card (line 419)
**Change to:** Add `role="complementary"` and `aria-label="Usage instructions"`

**End of section:** Change closing `</div>` to `</section>`

### 2. VoxNoteTab Component (Lines 802-1033)

**Current:** `<div className="space-y-2 sm:space-y-3">`
**Change to:**
```tsx
<section role="region" aria-labelledby="voxnote-heading" className="space-y-2 sm:space-y-3">
  <h2 id="voxnote-heading" className="sr-only">Voice Note Translation Mode</h2>
```

**Current:** Browser warning (line 806)
**Change to:** Add `role="alert"` and `aria-hidden="true"` to emoji

**Current:** Offline warning (line 816)
**Change to:** Add `role="alert"` and `aria-hidden="true"` to emoji

**Current:** Recording indicator (line 874)
**Change to:**
```tsx
<div className="mt-2 sm:mt-3 flex items-center gap-2" role="status" aria-live="polite">
  <span className="relative flex..." aria-hidden="true">
  <span className="text-red-400 font-mono...">Recording: {formatTime(recordingTime)}</span>
```

**Current:** Error GlassCard (line 898)
**Change to:** Add `role="alert"` and `aria-live="assertive"`

**Current:** Original Text div (line 905)
**Change to:** Wrap in `role="region"` with `aria-labelledby="original-text-label"`

**Current:** Translated Text div (line 934)
**Change to:** Wrap in `role="region"` with `aria-labelledby="translation-label"`

**Current:** WhatsApp Tip card (line 1018)
**Change to:** Add `role="complementary"` and `aria-label="Usage tip"`

**End of section:** Change closing `</div>` to `</section>`

### 3. HomeContent Component (Lines 1246-1541)

**Current:** `<div className="w-full max-w-md...">`  (line 1251)
**Change to:** `<main className="w-full max-w-md...">`

**Current:** Logo div (line 1253)
**Change to:**
```tsx
<header className="mb-4 sm:mb-6">
  <h1 className="sr-only">Voxxo - Real-time Translation App</h1>
  <VoxxoLogo size="md" animate showBrand />
</header>
```

**Current:** Mode Tabs div (line 1279)
**Change to:**
```tsx
<nav className="p-2 sm:p-3 border-b border-white/[0.06]" aria-label="Translation mode selection">
  <PillTabs... />
</nav>
```

**Current:** Wingman section (line 1295)
**Change to:**
```tsx
<section role="region" aria-labelledby="wingman-heading" className="space-y-4 text-center">
  <div className="relative w-20 h-20 mx-auto" aria-hidden="true">
  <h3 id="wingman-heading" className="text-xl font-bold text-white">Wingman Mode</h3>
```

Add `aria-label` to Activate Wingman button

**Current:** Proximity section (line 1344)
**Change to:**
```tsx
<section role="region" aria-labelledby="proximity-heading" className="space-y-4 text-center">
  <div className="relative w-20 h-20 mx-auto" aria-hidden="true">
  <h3 id="proximity-heading" className="text-xl font-bold text-white">Proximity Connect</h3>
```

Add `aria-label` to Start Proximity button

**Current:** Remote mode section (line 1391)
**Change to:**
```tsx
<section role="region" aria-labelledby="remote-mode-heading">
  <h3 id="remote-mode-heading" className="sr-only">
    {activeTab === "video" ? "Video Call Mode" : "Remote Talk Mode"}
  </h3>
```

**Current:** Name input (line 1436)
**Change to:** Add `htmlFor="user-name"` to label and `id="user-name"` to input

**Current:** Language grid (line 1450)
**Change to:** Wrap in `<div role="radiogroup" aria-labelledby="language-label">`

**Current:** Join code input (line 1486)
**Change to:** Add `id="join-code"` and proper `aria-label`

**Current:** Footer div (line 1517)
**Change to:** `<footer className="text-center mt-4...">`

**End of main:** Change closing `</div>` to `</main>`

### 4. Joining Screen (Lines 1176-1233)

**Current:** `<div className="min-h-screen...">`
**Change to:** `<main className="min-h-screen...">`

**Current:** Icon div (line 1182)
**Change to:** Add `aria-hidden="true"`

**Current:** `<h2 className="text-xl...">`  (line 1187)
**Change to:** `<h1 className="text-xl...">` (this is the main heading of the page)

**Current:** Name input (line 1200)
**Change to:** Add `htmlFor="join-name"` and `id="join-name"`, plus `aria-label`

**Current:** Language grid (line 1213)
**Change to:** Add `id="join-language-label"` to label and wrap grid in radiogroup

**End:** Change closing `</div>` to `</main>`

### 5. Decorative Emojis Throughout

Add `aria-hidden="true"` to all decorative emoji spans:
- Line 308, 315, 334, 410, 425 (VoxType)
- Line 950, 968, 975, 1010, 1024 (VoxNote)
- Line 1224, 1304, 1337, 1353, 1384, 1400, 1478, 1503 (HomeContent)

## Implementation Priority

1. **Critical (App Store blockers):**
   - Add semantic landmarks (`<main>`, `<nav>`, `<header>`, `<footer>`)
   - Add proper heading hierarchy (h1, h2, h3)
   - Add ARIA labels to interactive elements

2. **High (Usability):**
   - Add `role="region"` to major sections
   - Add `aria-live` to dynamic content
   - Add `aria-labelledby` for section headers

3. **Medium (Best practices):**
   - Add `aria-hidden="true"` to decorative elements
   - Add proper form labels with `htmlFor` and `id`

## Testing Checklist

- [ ] Screen reader can navigate by landmarks
- [ ] All form inputs have associated labels
- [ ] Dynamic content changes are announced
- [ ] Heading hierarchy is logical (h1 → h2 → h3)
- [ ] Interactive elements have descriptive labels
- [ ] Decorative elements are hidden from screen readers
