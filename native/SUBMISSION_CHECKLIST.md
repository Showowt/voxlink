# ENTREVOZ — Final Submission Checklist

Keep this open while you click. Two jobs: **(1) App Privacy labels**, **(2) build 9 device pass.**

---

## 1 · App Privacy Labels (~5 min)

**Where:** appstoreconnect.apple.com → My Apps → **ENTREVOZ** → left sidebar **App Privacy** → **Get Started** (or **Edit**)

### Opening question

> "Do you or your third-party partners collect data from this app?"

✅ **Yes, we collect data from this app**

### Data types — check EXACTLY these, nothing else

| Category | Check | Why |
|---|---|---|
| **Contact Info** | ✅ Name · ✅ Email Address | Signup collects both |
| **User Content** | ✅ Audio Data · ✅ Other User Content | Voice is transcribed/translated; transcripts & vocab saved |
| **Identifiers** | ✅ User ID · ✅ Device ID | Account ID + app-generated device ID |
| **Usage Data** | ✅ Product Interaction | Streaks, session counts, minutes |
| Everything else (Location, Health, Financial, Contacts, Browsing/Search History, Purchases, Diagnostics, Sensitive Info) | ❌ leave unchecked | Not collected in-app |

### Per-type questions — same three answers every time

Apple then asks about **each** checked type. Answer identically for all of them:

1. **"How is this data used?"**
   → ✅ **App Functionality** only
   *(exception: for **Product Interaction** also check ✅ **Analytics**)*

2. **"Is this data linked to the user's identity?"**
   → ✅ **Yes, linked to identity** (everything ties to the account)

3. **"Is this data used for tracking purposes?"** (tracking = following users across OTHER companies' apps/websites for ads)
   → ❌ **No** — for every single type. This is what keeps the ATT popup out of your app.

### Finish

Click **Publish** on the App Privacy page. Done — the labels appear on your store listing.

---

## 2 · Build 9 Device Pass (~10 min)

The app loads the live site, so **all 22 audit fixes are already in build 9** — just force-quit and relaunch first (swipe up, swipe the app away, reopen).

### Solo checks (one iPhone)

- [ ] App opens to the dark Entrevoz home, no browser bars, feels native
- [ ] **Face-to-Face** → EN ↔ ES → speak a sentence → transcript + translation appear, voice plays
- [ ] Say **"Thank you"** and **"Bye"** clearly → they now SHOW in captions (used to vanish)
- [ ] Start a **Video Call** → "Share this code" screen shows the **visible join link + Share Link / WhatsApp / Copy buttons** → tap Share Link → iOS share sheet opens
- [ ] Tap the **🎭 voice toggle** mid-playback → audio stops INSTANTLY
- [ ] **Recordings** (History tab) → if you have one: **Play** opens the inline player, **Download** opens the share sheet
- [ ] Profile → **Sign out**, then **Sign Up** with a throwaway email → you get the **"📬 Check your email"** screen (not a silent bounce)
- [ ] No "Subtítulos… Amara.org" ever appears

### Two-device checks (iPhone + any browser — this is the money test)

- [ ] Start Video Call on the phone → send the join link to a laptop/second phone → both connect
- [ ] Wait ~20 s → **"Learning voice…%"** appears, then translations play in the **partner's cloned voice** (not a robot)
- [ ] Tap **Mute** on the phone → partner truly hears NOTHING (was broken before today)
- [ ] Tap **camera off** → partner's view of you actually goes dark
- [ ] Both sides see live translated captions both directions

### If anything fails
Screenshot it and tell Claude — web-side fixes deploy in ~60 s without a new build.

---

## 3 · Then say the word

Reply **"submit it"** and Claude runs the final pre-submission checks and files the App Store review submission via the API.

**Review creds already on file with Apple:** `reviewer@entrevoz.co` / `EntrevozReview2026!` ✅ (confirmed + sign-in verified)
