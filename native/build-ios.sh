#!/usr/bin/env bash
# Headless build + sign + upload of the Entrevoz iOS app (VoIP ring-when-closed).
# Requires: Xcode installed + an App Store Connect API key (.p8).
# Usage:
#   ASC_KEY_PATH=/path/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX bash native/build-ios.sh
# ASC_ISSUER_ID defaults to the team's known issuer id.
set -euo pipefail
# Point at full Xcode without needing `sudo xcode-select` (CLT can't build iOS).
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
cd "$(dirname "$0")/../ios/App"

ASC_ISSUER_ID="${ASC_ISSUER_ID:-18ea1a6b-9f32-4076-b95b-56b7f0955a4c}"
: "${ASC_KEY_PATH:?set ASC_KEY_PATH to the downloaded AuthKey_*.p8}"
: "${ASC_KEY_ID:?set ASC_KEY_ID (the API key id)}"

echo "▸ Xcode: $(xcodebuild -version | head -1)"
echo "▸ cleaning + archiving (automatic signing via API key)…"
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

# Preflight: build 12 shipped a bundle whose LaunchScreen lookup threw at launch
# (SplashScreen plugin → UIStoryboard → SIGABRT on every open, see
# native/crash-build12-launch.txt). Never upload a bundle that would do that.
APP_BUNDLE="build/App.xcarchive/Products/Applications/App.app"
echo "▸ preflight: verifying archive bundle…"
for SB in LaunchScreen Main; do
  if [ ! -e "$APP_BUNDLE/Base.lproj/$SB.storyboardc" ]; then
    echo "❌ $SB.storyboardc missing from the app bundle — the app would crash at launch. Upload aborted."
    exit 1
  fi
done
BUILD_NUM=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_BUNDLE/Info.plist")
MARKETING=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_BUNDLE/Info.plist")
echo "  bundle OK — $MARKETING ($BUILD_NUM), storyboards present"

echo "▸ exporting + uploading to App Store Connect…"
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist exportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

echo "✅ Uploaded. It appears in App Store Connect → TestFlight in ~5-15 min (processing)."
