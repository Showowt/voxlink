-- Reproduce the dedup-critical UNIQUE index that already exists in prod but had
-- no migration file (schema drift — found by the wake-fix red-team, DEDUP-1).
-- The one-ring-row-per (room,to_address) invariant is what makes
-- /api/ring/send's update-if-ringing-else-insert + 23505 dedup correct, and in
-- turn what makes the Web Push fire EXACTLY once per ring. Without it, concurrent
-- re-rings would create duplicate rows and duplicate pushes.
create unique index if not exists uq_ring_room_addr
  on public.ring_invites (room, to_address);

-- NOTE (not applied here, tracked in native/WAKE_LAYER.md): ring_invites,
-- push_tokens, diag_events, and other live tables were created via the dashboard
-- and still lack migration files. A later pass should backfill them so a fresh
-- environment is reproducible from migrations alone.
