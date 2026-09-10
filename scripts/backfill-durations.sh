#!/bin/sh
# Fills durationSeconds on YouTube FeedItem rows that predate the field, by
# calling POST /api/backfill/durations in a loop (50 videos = 1 YouTube
# quota unit per call) until nothing new comes back.
#
#   HERMES_POLL_SECRET=...  ./scripts/backfill-durations.sh
#
# HERMES_URL defaults to http://localhost:3000. On the VPS, run it from
# inside the docker network with HERMES_URL=http://hermes:3000, or point it
# at the public https URL.
set -eu

: "${HERMES_POLL_SECRET:?set HERMES_POLL_SECRET}"
URL="${HERMES_URL:-http://localhost:3000}"

total=0
while :; do
  resp=$(curl -sS -X POST "$URL/api/backfill/durations" \
    -H "Authorization: Bearer $HERMES_POLL_SECRET" \
    -H "Content-Type: application/json")
  echo "$resp"

  updated=$(printf '%s' "$resp" | sed -n 's/.*"updated":[[:space:]]*\([0-9]*\).*/\1/p')
  remaining=$(printf '%s' "$resp" | sed -n 's/.*"remaining":[[:space:]]*\([0-9]*\).*/\1/p')
  updated=${updated:-0}
  remaining=${remaining:-0}
  total=$((total + updated))

  if [ "$remaining" -eq 0 ]; then
    echo "done - $total rows filled, nothing left"
    break
  fi
  if [ "$updated" -eq 0 ]; then
    echo "stopping - $total rows filled, $remaining left that YouTube won't return (deleted/private videos)"
    break
  fi
  sleep 1
done
