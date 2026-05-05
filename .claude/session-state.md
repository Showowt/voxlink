## Last Session: 2026-05-05
## What was done:
- Group Calls feature fully implemented (mesh P2P, 2-4 participants)
- Supabase tables created: group_rooms, group_messages (with RLS + Realtime)
- Type definitions: app/lib/group-call/types.ts
- API routes: /api/group/create, /api/group/join, /api/group/leave, /api/group/[code]
- useGroupCall hook: hooks/useGroupCall.ts (PeerJS mesh, VAD, STT, DataChannel)
- Group landing page: app/group/page.tsx
- Active call page: app/group/[id]/page.tsx (lobby, active, error, ended states)
- Homepage integration: Group tab added between video and proximity tabs
- Deployed to production: https://www.entrevoz.co
- Existing routes (/call, /talk) verified untouched and working

## What's next:
- Manual testing of group calls with multiple browser tabs
- Potential: Add Supabase Realtime subscription for live room state sync
- Potential: Add /api/group/stats endpoint

## Current blockers: None
## Deploy status: https://www.entrevoz.co (live, verified 200)
