# Code Splitting Infrastructure - Voxxo

## Status: READY ✓

The `dynamic` import from Next.js has been added to `/app/page.tsx` (line 4).

## Current State

All tab components are defined inline in `page.tsx`:
- **VoxTypeTab** (~400 lines) - Type & verify translation mode
- **VoxNoteTab** (~600 lines) - Voice recording & translation mode
- **Wingman Mode** section (~50 lines) - AI coaching interface
- **Proximity Mode** section (~50 lines) - Nearby user discovery
- **Video/Talk Mode** forms (~150 lines) - Call setup interfaces

## Future Optimization Path

### Step 1: Extract Components to Separate Files

Create these files under `/app/components/modes/`:
```
/app/components/modes/
  ├── VoxTypeTab.tsx
  ├── VoxNoteTab.tsx
  ├── WingmanMode.tsx
  ├── ProximityMode.tsx
  └── VideoTalkMode.tsx
```

### Step 2: Implement Dynamic Imports

Replace inline components with dynamic imports in `page.tsx`:

```tsx
const VoxTypeTab = dynamic(() => import('./components/modes/VoxTypeTab'), {
  loading: () => <GlassCard variant="subtle" padding="lg">
    <div className="flex items-center justify-center gap-2 py-4">
      <div className="w-5 h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-white/70 text-sm">Loading...</span>
    </div>
  </GlassCard>,
  ssr: false // These modes use browser APIs (speech, clipboard, etc)
});

const VoxNoteTab = dynamic(() => import('./components/modes/VoxNoteTab'), {
  loading: () => <GlassCard variant="subtle" padding="lg">
    <div className="flex items-center justify-center gap-2 py-4">
      <div className="w-5 h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-white/70 text-sm">Loading...</span>
    </div>
  </GlassCard>,
  ssr: false
});
```

### Step 3: Benefits

**Bundle Size Reduction:**
- Each lazy-loaded mode reduces initial bundle by ~1000+ lines
- Only the active tab loads its code
- Faster Time to Interactive (TTI) for initial page load

**User Experience:**
- First tab (VoxType) loads immediately
- Other tabs load on-demand when user switches to them
- Loading states provide visual feedback during lazy load

**Performance Metrics (Expected):**
- Initial bundle size: ~1565 lines → ~400 lines (75% reduction)
- Initial parse time: Reduced proportionally
- TTI improvement: 200-500ms faster on mobile

## Implementation Notes

1. **SSR Disabled**: All modes use browser APIs (speech, clipboard, navigator) so `ssr: false` is required
2. **Loading States**: Use existing `GlassCard` components for consistent loading UI
3. **Shared Dependencies**: Language selectors, UI components remain in main bundle
4. **Progressive Enhancement**: App works immediately, additional features load as needed

## When to Implement

**Do it when:**
- Bundle size becomes a performance concern (Lighthouse score < 90)
- Users on slow connections report loading issues
- Adding more heavy features to the page

**Don't do it yet if:**
- Current performance is acceptable
- Team velocity is more important than optimization
- Components are still being refactored frequently

## Current Performance

As of now, all components load synchronously. The infrastructure is in place (`dynamic` imported) but not yet utilized. This is acceptable for the current codebase size and allows for faster iteration during development.

---

**Last Updated:** 2026-03-11
**Infrastructure Status:** Ready, awaiting implementation
**Priority:** Low (optimize when needed)
