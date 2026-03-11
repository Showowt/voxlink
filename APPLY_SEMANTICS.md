# Quick Apply Guide - Semantic HTML for App Store Compliance

## File: `/Users/showowt/machinemind-builds/voxlink/app/page.tsx`

### Critical Changes (Do These First)

#### 1. VoxTypeTab - Add Section with Heading
**Find (line 227):**
```tsx
  return (
    <div className="space-y-3 sm:space-y-4">
```

**Replace with:**
```tsx
  return (
    <section role="region" aria-labelledby="voxtype-heading" className="space-y-3 sm:space-y-4">
      <h2 id="voxtype-heading" className="sr-only">Type and Translate Mode</h2>
```

**Find (line 434):**
```tsx
    </div>
  );
}
```

**Replace with:**
```tsx
    </section>
  );
}
```

#### 2. VoxNoteTab - Add Section with Heading
**Find (line 801):**
```tsx
  return (
    <div className="space-y-2 sm:space-y-3">
```

**Replace with:**
```tsx
  return (
    <section role="region" aria-labelledby="voxnote-heading" className="space-y-2 sm:space-y-3">
      <h2 id="voxnote-heading" className="sr-only">Voice Note Translation Mode</h2>
```

**Find (line 1032):**
```tsx
    </div>
  );
}
```

**Replace with:**
```tsx
    </section>
  );
}
```

#### 3. HomeContent - Add Main Landmark
**Find (line 1251):**
```tsx
      <div className="w-full max-w-md mx-auto flex-shrink-0">
        {/* Logo - Premium Animated */}
        <div className="mb-4 sm:mb-6">
          <VoxxoLogo size="md" animate showBrand />
        </div>
```

**Replace with:**
```tsx
      <main className="w-full max-w-md mx-auto flex-shrink-0">
        {/* Logo - Premium Animated */}
        <header className="mb-4 sm:mb-6">
          <h1 className="sr-only">Voxxo - Real-time Translation App</h1>
          <VoxxoLogo size="md" animate showBrand />
        </header>
```

**Find (line 1517):**
```tsx
        {/* Footer - Premium Minimal */}
        <div className="text-center mt-4 sm:mt-6 space-y-2 pb-2">
```

**Replace with:**
```tsx
        {/* Footer - Premium Minimal */}
        <footer className="text-center mt-4 sm:mt-6 space-y-2 pb-2">
```

**Find (line 1539):**
```tsx
        </div>
      </div>
```

**Replace with:**
```tsx
        </footer>
      </main>
```

#### 4. Add Navigation Landmark
**Find (line 1278):**
```tsx
          {/* Mode Tabs - Premium PillTabs */}
          <div className="p-2 sm:p-3 border-b border-white/[0.06]">
            <PillTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
              variant="compact"
            />
          </div>
```

**Replace with:**
```tsx
          {/* Mode Tabs - Premium PillTabs */}
          <nav className="p-2 sm:p-3 border-b border-white/[0.06]" aria-label="Translation mode selection">
            <PillTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
              variant="compact"
            />
          </nav>
```

#### 5. Add Form Labels
**Find (line 1436):**
```tsx
                <div className="mb-4">
                  <label className="block text-sm text-white/60 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder-white/30 text-lg"
                  />
                </div>
```

**Replace with:**
```tsx
                <div className="mb-4">
                  <label htmlFor="user-name" className="block text-sm text-white/60 mb-2">
                    Your Name
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    aria-label="Enter your name"
                    className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder-white/30 text-lg"
                  />
                </div>
```

#### 6. Add ARIA Live Regions
**Find (line 268):**
```tsx
      {/* Error */}
      {error && (
        <GlassCard variant="subtle" padding="sm" glow="error">
          <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>
        </GlassCard>
      )}
```

**Replace with:**
```tsx
      {/* Error */}
      {error && (
        <GlassCard variant="subtle" padding="sm" glow="error" role="alert" aria-live="assertive">
          <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>
        </GlassCard>
      )}
```

**Find (line 275):**
```tsx
      {/* Loading */}
      {isTranslating && (
        <div className="flex items-center justify-center gap-2 py-3 sm:py-4">
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/70 text-xs sm:text-sm">
            Translating...
          </span>
        </div>
      )}
```

**Replace with:**
```tsx
      {/* Loading */}
      {isTranslating && (
        <div className="flex items-center justify-center gap-2 py-3 sm:py-4" role="status" aria-live="polite">
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-white/70 text-xs sm:text-sm">
            Translating...
          </span>
        </div>
      )}
```

## Verification

After applying changes, verify:

```bash
# Check semantic landmarks exist
grep -c "<main" app/page.tsx    # Should be 1
grep -c "<nav" app/page.tsx     # Should be 1
grep -c "<header" app/page.tsx  # Should be 1
grep -c "<footer" app/page.tsx  # Should be 1

# Check ARIA attributes
grep -c "role=\"region\"" app/page.tsx  # Should be at least 2
grep -c "aria-label" app/page.tsx       # Should be multiple
grep -c "sr-only" app/page.tsx          # Should be at least 3

# Test TypeScript compilation
npm run build
```

## Testing

1. **VoiceOver (Mac):** Cmd+F5 to enable
2. **Screen Reader navigation:**
   - Navigate by landmarks: Ctrl+Option+U, then use arrow keys
   - Should see: Main, Navigation, Header, Footer
3. **Form labels:** Tab through inputs - each should announce its purpose
4. **Live regions:** Errors and loading states should be announced

## App Store Compliance

These changes address:
- ✅ **2.5.6 Apps must follow Apple's accessibility guidelines**
- ✅ **Proper semantic HTML structure**
- ✅ **ARIA labels for interactive elements**
- ✅ **Screen reader navigation support**
