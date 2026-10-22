-- A user's phone number so they can be reached by a WhatsApp/SMS "tap to answer"
-- when their app is closed (premium caller feature). Keyed by device_id like the
-- rest of the app; service-role only (never exposed to the anon key).
create table if not exists public.user_phones (
  device_id text primary key,
  phone text not null,            -- E.164, e.g. +573001234567
  user_id uuid,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_phones_phone_idx on public.user_phones (phone);
create index if not exists user_phones_user_idx on public.user_phones (user_id);

alter table public.user_phones enable row level security;
revoke all on public.user_phones from anon, authenticated;
