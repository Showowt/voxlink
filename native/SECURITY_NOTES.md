# Entrevoz calling — security hardening status (Sep 15)

From the calling-security audit. Split into **fixed this session** vs **needs
you** (DDL / Supabase dashboard / an identity decision I shouldn't make alone).

## ✅ Fixed + deployed this session
- **Private Daily rooms + meeting tokens** — rooms were `privacy:"public"`; anyone
  with the 6-char code could open the raw `daily.co` URL and seize/eavesdrop the
  call. Now `privacy:"private"`; joining requires a server-minted token from the
  rate-limited `/api/daily/room`. Verified: host joins a private room and reaches
  "Waiting for partner". (`app/api/daily/room/route.ts`, `app/lib/daily-connection.ts`)
- **CSPRNG room codes** — replaced predictable `Math.random()` with
  `crypto.getRandomValues` (`app/lib/room-code.ts`).
- **Block/mute + inbound throttle** — a leaked ring address can be silenced
  ("Block this caller" on the incoming-call screen); a source ringing >3×/60s is
  auto-suppressed. Verified E2E. (`app/lib/call-block.ts`, `hooks/useIncomingCall.ts`)

## ⚠️ Needs YOU (can't do from here)

### 1. Contacts API — device-id is the only "auth" (CRITICAL)
`/api/contacts` trusts a client-supplied `ownerDeviceId`, so anyone with a
victim's device UUID (it's in the shared `/add?d=<uuid>` QR/link) can READ their
whole contact list and WRITE/DELETE entries. **Real fix = app-layer identity:**
mint a per-device HMAC session token on first launch (never put it in the shared
QR — the QR carries only a rotatable "ring token"), store it, and require+verify
it on every `/api/contacts` call and on `sendCallInvite`. This is a design change
I want your sign-off on before building (it touches contacts + ring + dial).

### 2. `contacts` table has NO migration (schema drift / RLS unverifiable)
It was hand-created. Add a real migration with RLS. Skeleton to paste in the
Supabase SQL editor (project `zeqzygfxcmaettmbkusr`):

```sql
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_device_id text not null,
  contact_device_id text not null,
  display_name text,
  language text,
  call_count int not null default 1,
  last_called_at timestamptz default now(),
  is_favorite boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_device_id, contact_device_id)
);
alter table public.contacts enable row level security;
-- NOTE: device_id is not in the JWT, so a pure-RLS ownership check isn't
-- possible today — this is why #1 (HMAC identity, enforced in the API with the
-- service role) is the actual fix. Until then, keep anon DIRECT access denied
-- and let the server route be the only writer:
revoke all on public.contacts from anon;
```

### 3. Proximity RLS is wide open (HIGH)
`003_analytics_and_rls.sql` gives `proximity_presence` UPDATE/DELETE `USING(true)`
(anyone can flip/delete any user's row) and SELECT exposes every user's location
to any unauthenticated caller who POSTs a lat/lng → a scripted grid sweep maps
live user locations (sensitive under Ley 1581). Fix: revoke direct anon access
and serve proximity only through `SECURITY DEFINER` RPCs / server routes using
the service role; drop the `USING(true)` UPDATE/DELETE policies.

### 4. Supabase Realtime channels are open (CRITICAL, and it's currently DOWN)
`ring-*` / `call-*` are public broadcast topics — anyone with the anon key can
subscribe to or publish on any device's ring channel. When you **enable
anonymous Realtime** (the setting we already discussed — it also revives the ring
fast path + proximity + room-signal), also turn on **Realtime Authorization**
(private channels) with an `realtime.messages` RLS policy so only paired devices
can subscribe to a given `ring-*`/`call-*` topic.

## Clean (no action)
Secrets/keys are correctly server-side only — no `NEXT_PUBLIC_*` leakage of
TURN/Daily/Twilio credentials; `/api/turn` is the only route on the real
Upstash limiter.
