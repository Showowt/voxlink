# Native ring-when-closed (PushKit + CallKit) — setup + build

The app can now ring on a **closed/backgrounded** device via a VoIP push that
the native layer turns into a native CallKit incoming call. **All the web/server
code is built and deploys with the site. To make it actually ring you must do
the 4 one-time setup steps below and then ship a NEW iOS binary (build 11).**

## What's already built (ships via web deploy)
- `app/api/push/register` — stores a device's VoIP token (`push_tokens` table).
- `app/api/push/voip` — sends the VoIP push via APNs (HTTP/2 + ES256 JWT).
- `app/lib/native-call.ts` — registers the token + navigates into the room on
  answer; `sendCallInvite` also fires a VoIP push (parallel to the in-app ring).
- Native: `ios/App/App/EntrevozCall.swift` (PushKit + CallKit + Capacitor
  plugin), `AppDelegate` starts it, `Info.plist` background modes (voip, audio),
  `App.entitlements` (aps-environment).

## Step 1 — `push_tokens` table (Supabase SQL editor, project zeqzygfxcmaettmbkusr)
```sql
create table if not exists public.push_tokens (
  device_id text primary key,
  dial_code text,
  voip_token text not null,
  platform text not null default 'ios',
  updated_at timestamptz default now()
);
create index if not exists push_tokens_dial_code_idx on public.push_tokens (dial_code);
alter table public.push_tokens enable row level security;
-- Written/read only by the server routes (service role); deny anon direct.
revoke all on public.push_tokens from anon;
```

## Step 2 — Apple VoIP push key (Apple Developer portal → Certificates, IDs & Profiles)
1. **Keys → +** → enable **Apple Push Notifications service (APNs)** → download the
   `AuthKey_XXXXXXXXXX.p8` (one-time download). Note the **Key ID**.
2. **Identifiers → App ID `com.entrevoz.app`** → enable the **Push Notifications**
   capability → Save.
3. Team ID is `4C39DXRG9L`.

## Step 3 — Vercel env vars (Production)
```
APNS_KEY        = <full contents of AuthKey_XXXX.p8, BEGIN/END lines included>
APNS_KEY_ID     = <the key id from step 2.1>
APNS_TEAM_ID    = 4C39DXRG9L
APNS_BUNDLE_ID  = com.entrevoz.app
APNS_ENV        = production      # use "sandbox" only for a dev-signed build
```
Until these are set, `/api/push/voip` safely returns `{delivered:false,
reason:"not_configured"}` — the in-app ring still works.

## Step 4 — Xcode: add capabilities, then archive build 11
1. Open `ios/App/App.xcodeproj` → target **App** → **Signing & Capabilities**:
   - **+ Capability → Push Notifications**
   - **+ Capability → Background Modes** → check **Voice over IP** and **Audio**
   (Xcode links `App.entitlements` + updates the provisioning profile.)
2. Confirm the Capacitor plugin auto-registers (it conforms to `CAPBridgedPlugin`
   with `@objc(EntrevozCallPlugin)`). If `EntrevozCall` isn't found from JS,
   register it in `SceneDelegate`/bridge via `bridge.registerPluginInstance(...)`.
3. Bump `CURRENT_PROJECT_VERSION` (10 → 11) in both pbxproj configs, then archive
   + upload headless (same pattern as build 10):
   ```
   xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination generic/platform=iOS -archivePath <ar> -allowProvisioningUpdates \
     -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_U23PJ7SP52.p8 \
     -authenticationKeyID U23PJ7SP52 -authenticationKeyIssuerID 18ea1a6b-9f32-4076-b95b-56b7f0955a4c archive
   xcodebuild -exportArchive -archivePath <ar> -exportOptionsPlist ios/App/exportOptions.plist ...
   ```

⚠️ Build 10 is IN REVIEW. Uploading build 11 to TestFlight is fine (separate from
the submission), but do NOT attach build 11 to the in-review version — finish the
2.1/3.1.1 review on build 10 first, then submit build 11 for the ring feature.

## How it works
Caller dials → `/api/push/voip` sends a VoIP push to the callee's stored token →
PushKit wakes the (even killed) app → CallKit shows the native ring → answer →
the WebView navigates to `/call/<room>?host=false`. Decline → CallKit end action.

## Verify (after steps 1–4 + build 11 on a device)
- Install build 11 via TestFlight, open once (registers the VoIP token — check a
  `push_tokens` row appears).
- Force-quit the app. From a second device, dial your code.
- The phone should ring with the native CallKit screen; answering opens the call.
