-- OTP-based password recovery. Codes are short-lived, hashed, rate-limited.
-- Delivered by email (the only universal identifier for Entrevoz accounts).
create table if not exists public.password_reset_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  user_id     uuid not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_prc_email   on public.password_reset_codes (lower(email));
create index if not exists idx_prc_expires on public.password_reset_codes (expires_at);

-- Codes must never be readable by clients. RLS on + no policies => only the
-- service role (which bypasses RLS) can touch this table.
alter table public.password_reset_codes enable row level security;
revoke all on public.password_reset_codes from anon, authenticated;

-- email -> auth user id. SECURITY DEFINER so the service role can resolve an
-- account without exposing the auth schema; search_path pinned; execute granted
-- to service_role only.
create or replace function public.reset_lookup_user(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(p_email)
    and deleted_at is null
  limit 1;
$$;

revoke all on function public.reset_lookup_user(text) from public, anon, authenticated;
grant execute on function public.reset_lookup_user(text) to service_role;
