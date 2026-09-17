#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Entrevoz App Store review-status check — designed to run from cron every 30m.
# Durable: survives session/terminal resets (unlike a background shell loop).
# On the FIRST transition out of WAITING_FOR_REVIEW it fires a macOS native
# notification, appends to the log, and writes a flag file. De-duped so it won't
# re-alert every tick. No secrets in here — asc-api.mjs reads the local .p8 key.
# ─────────────────────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.." || exit 1

LOG="native/review-status.log"
FLAG="native/.review-notified"      # holds the state we've already alerted on
BASELINE="WAITING_FOR_REVIEW"
TS="$(date -u +%Y-%m-%dT%H:%MZ)"

STATE="$(node native/watch-review-status.mjs 2>/dev/null | sed -n 's/.*state: //p')"

# Null / throttled / unchanged → just log and leave.
if [ -z "$STATE" ] || [ "$STATE" = "null" ] || [ "$STATE" = "$BASELINE" ]; then
  echo "[$TS] cron: ${STATE:-<null>}" >> "$LOG"
  exit 0
fi

# State changed. Alert once per distinct new state.
ALREADY="$(cat "$FLAG" 2>/dev/null)"
if [ "$ALREADY" != "$STATE" ]; then
  echo "$STATE" > "$FLAG"
  echo "[$TS] *** CHANGE *** $BASELINE -> $STATE" >> "$LOG"
  osascript -e "display notification \"Status is now: $STATE\" with title \"Entrevoz — App Store Review\" subtitle \"Tap to open App Store Connect\" sound name \"Glass\"" 2>/dev/null
else
  echo "[$TS] cron: $STATE (already notified)" >> "$LOG"
fi
