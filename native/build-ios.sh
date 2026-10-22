#!/usr/bin/env bash
# Headless build + sign + upload of the Entrevoz iOS app (VoIP ring-when-closed).
# Requires: Xcode installed + an App Store Connect API key (.p8).
# Usage:
#   ASC_KEY_PATH=/path/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX bash native/build-ios.sh
# ASC_ISSUER_ID defaults to the team's known issuer id.
#
# SIGNING: this account's API key is Developer-role — it can create certs via the
# API and upload builds, but it CANNOT cloud-sign a distribution build. So we
# archive with automatic signing (dev cert) and EXPORT with MANUAL distribution
# signing using a persisted distribution identity in ~/.entrevoz-ios-signing
# (cert DJCJLD72QG + profile "Entrevoz AppStore MM"). If that dir is missing,
# recreate it with native/make-ios-signing.sh (see native/NATIVE_RING.md).
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$(dirname "$0")/../ios/App"

ASC_ISSUER_ID="${ASC_ISSUER_ID:-18ea1a6b-9f32-4076-b95b-56b7f0955a4c}"
: "${ASC_KEY_PATH:?set ASC_KEY_PATH to the downloaded AuthKey_*.p8}"
: "${ASC_KEY_ID:?set ASC_KEY_ID (the API key id)}"

SIGN_DIR="$HOME/.entrevoz-ios-signing"
KC="$SIGN_DIR/ev.keychain-db"; KCPASS=evbuild; P12PASS=evp12

echo "▸ Xcode: $(xcodebuild -version | head -1)"

# ── 1. Rebuild the signing keychain from persisted distribution material ──────
if [ -f "$SIGN_DIR/dist.p12" ]; then
  echo "▸ loading distribution identity from $SIGN_DIR"
  security delete-keychain "$KC" 2>/dev/null || true
  security create-keychain -p "$KCPASS" "$KC"
  security set-keychain-settings "$KC"           # no auto-lock timeout
  security unlock-keychain -p "$KCPASS" "$KC"
  ORIG=$(security list-keychains -d user | sed 's/"//g')
  security list-keychains -d user -s "$KC" $ORIG # keep login etc. in the list
  security import "$SIGN_DIR/dist.p12" -k "$KC" -P "$P12PASS" \
    -T /usr/bin/codesign -T /usr/bin/xcodebuild -T /usr/bin/productbuild -A
  security import "$SIGN_DIR/AppleWWDRCAG3.cer" -k "$KC" 2>/dev/null || true
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KCPASS" "$KC" >/dev/null 2>&1 || true
  if [ -f "$SIGN_DIR/Entrevoz_AppStore_MM.mobileprovision" ] && [ -f "$SIGN_DIR/profile_uuid.txt" ]; then
    mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
    cp "$SIGN_DIR/Entrevoz_AppStore_MM.mobileprovision" \
       "$HOME/Library/MobileDevice/Provisioning Profiles/$(cat "$SIGN_DIR/profile_uuid.txt").mobileprovision"
  fi
  security find-identity -v -p codesigning "$KC" | grep -i distribution || true
else
  echo "⚠ $SIGN_DIR/dist.p12 not found — export will fall back to cloud signing (likely to fail on a Developer-role key)."
fi

# ── 2. Archive (automatic signing creates/uses a dev cert via the API key) ────
echo "▸ cleaning + archiving…"
rm -rf build
xcodebuild clean archive \
  -project App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive \
  -skipPackagePluginValidation \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  COMPILER_INDEX_STORE_ENABLE=NO

# ── 2.5 Preflight: never upload a bundle that would crash at launch ───────────
# Build 12 shipped with the plist-based UILaunchScreen (no UILaunchStoryboardName);
# the Capacitor SplashScreen plugin still does UIStoryboard(name:"LaunchScreen") at
# plugin load, which throws NSInvalidArgumentException → SIGABRT on EVERY open
# (see native/crash-build12-launch.txt). Keep the storyboard launch screen, and
# refuse to upload any archive that doesn't carry it.
APP_BUNDLE="build/App.xcarchive/Products/Applications/App.app"
echo "▸ preflight: verifying archive bundle…"
for SB in LaunchScreen Main; do
  if [ ! -e "$APP_BUNDLE/Base.lproj/$SB.storyboardc" ]; then
    echo "❌ $SB.storyboardc missing from the app bundle — the app would crash at launch. Upload aborted."
    exit 1
  fi
done
/usr/libexec/PlistBuddy -c 'Print :UILaunchStoryboardName' "$APP_BUNDLE/Info.plist" >/dev/null 2>&1 || {
  echo "❌ Info.plist has no UILaunchStoryboardName — SplashScreen plugin would crash at launch. Upload aborted."
  exit 1
}
BUILD_NUM=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_BUNDLE/Info.plist")
MARKETING=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_BUNDLE/Info.plist")
echo "  bundle OK — $MARKETING ($BUILD_NUM), storyboards + launch storyboard key present"

# ── 3. Export with MANUAL distribution signing + upload to App Store Connect ──
echo "▸ exporting (manual distribution signing) + uploading…"
[ -f "$SIGN_DIR/dist.p12" ] && security unlock-keychain -p "$KCPASS" "$KC" || true
EXPORT_PLIST=exportOptions.plist
[ -f exportOptions-manual.plist ] && [ -f "$SIGN_DIR/dist.p12" ] && EXPORT_PLIST=exportOptions-manual.plist
echo "  using $EXPORT_PLIST"
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

echo "✅ Uploaded. It appears in App Store Connect → TestFlight in ~5-15 min (processing)."
