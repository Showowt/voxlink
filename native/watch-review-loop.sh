#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Entrevoz App Store review-status watcher (local — needs the ASC signing key).
# Polls every 30 min. Logs each check. The MOMENT the state leaves
# WAITING_FOR_REVIEW it records a CHANGE line and exits (task-completion then
# re-invokes Claude to relay the news to Phil). Safe: single serial call per
# tick, no fork-loops, treats null/throttled as "no change".
#   Run detached:  bash native/watch-review-loop.sh &
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.." || exit 1

LOG="native/review-status.log"
INTERVAL=1800          # 30 minutes
MAX=336                # ~7 days of checks
START="WAITING_FOR_REVIEW"

echo "[$(date -u +%H:%MZ)] watcher started (baseline: $START)" >> "$LOG"

for i in $(seq 1 "$MAX"); do
  STATE="$(node native/watch-review-status.mjs 2>/dev/null | sed -n 's/.*state: //p')"
  TS="$(date -u +%H:%MZ)"

  if [ -n "$STATE" ] && [ "$STATE" != "null" ] && [ "$STATE" != "$START" ]; then
    echo "[$TS] *** CHANGE *** $START -> $STATE (check $i/$MAX)" >> "$LOG"
    echo "STATE_CHANGED:$STATE"
    exit 0
  fi

  echo "[$TS] still ${STATE:-<null>} (check $i/$MAX)" >> "$LOG"
  sleep "$INTERVAL"
done

echo "[$(date -u +%H:%MZ)] watcher reached MAX checks, still $START" >> "$LOG"
