-- Web Push subscriptions: the out-of-band WAKE path for web/PWA users so a
-- CLOSED or backgrounded phone still rings. Keyed by device_id AND dial_code
-- (a caller dials either), mirroring push_tokens/ring_invites. Service-role
-- only (all access via supabaseAdmin in API routes); no anon/auth policies.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  dial_code text,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_id uuid,
  ua text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_device_idx on public.push_subscriptions (device_id);
create index if not exists push_subscriptions_dialcode_idx on public.push_subscriptions (dial_code);

alter table public.push_subscriptions enable row level security;
-- No policies on purpose: only the service role (which bypasses RLS) may read
-- or write. The anon key must never enumerate subscription endpoints.
revoke all on public.push_subscriptions from anon, authenticated;
