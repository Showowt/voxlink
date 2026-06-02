# Project Scan: Frontend — UI/UX Deep Audit

Run after building UI, before showing anyone.

## Deploy 4 parallel agents:

### Agent 1: Page-by-Page Walkthrough
- Glob for every `**/page.tsx` file
- Read each page, verify imports resolve, no missing components
- Check every button has an onClick or href
- Check every link destination exists
- Trace user flows: what happens when you click each button?

### Agent 2: Mobile Responsiveness
- Check every page for Tailwind responsive classes (sm:, md:, lg:)
- Verify no fixed widths without responsive alternatives
- All buttons min-h-[44px] (touch targets)
- Safe area handling (notch, home indicator)
- 100dvh not 100vh for mobile browsers
- No horizontal scroll on 375px screens

### Agent 3: Loading, Error, Empty States
- Every route must have loading.tsx
- Every route should have error.tsx or be wrapped in error boundary
- Every data-fetching component needs: loading spinner, error message, empty state
- Check async components show skeleton while fetching
- Check what happens when APIs fail

### Agent 4: Visual Consistency
- Dark mode only: bg-[#060810], cards bg-[#12121a], borders border-white/10
- Accent: #00C896 (teal), secondary #0066FF (blue)
- Text: text-white primary, text-white/70 secondary, text-white/40 muted
- No light mode elements, no white backgrounds
- Consistent spacing: p-3 sm:p-4, gap-3 sm:gap-4
- All interactive elements have hover/active states
- No console.log in production (check next.config compiler.removeConsole)

## After audit: Fix all CRITICAL and HIGH issues, build, deploy.
