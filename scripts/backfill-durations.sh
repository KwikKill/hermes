#!/bin/sh
# Fills durationSeconds on YouTube FeedItem rows that predate the field, by
# calling POST /api/backfill/durations in a loop (50 videos = 1 YouTube
# quota unit per call) until nothing new comes back.
#
# /api/* is behind Authentik forward_auth (only /rss/* isn't), so this must
# hit hermes directly on the docker network, not the public URL. Run it
# through the hermes-cron sidecar, which is already on that network with
# HERMES_POLL_SECRET in its env:
#
#   ./compose.sh exec -T -e HERMES_URL=http://hermes:3000 hermes-cron sh < hermes/scripts/backfill-durations.sh
#
# HERMES_URL defaults to http://localhost:3000 (works when run from inside
# the hermes container itself).
set -eu

: "${HERMES_POLL_SECRET:?set HERMES_POLL_SECRET}"
URL="${HERMES_URL:-http://localhost:3000}"

total=0
while :; do
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' \
    -X POST "$URL/api/backfill/durations" \
    -H "Authorization: Bearer $HERMES_POLL_SECRET" \
    -H "Content-Type: application/json") || {
    echo "curl failed to reach $URL/api/backfill/durations - check HERMES_URL"
    rm -f "$body"
    exit 1
  }
  resp=$(cat "$body")
  rm -f "$body"
  echo "HTTP $code $resp"

  if [ "$code" != "200" ]; then
    echo "non-200 response - check HERMES_POLL_SECRET matches hermes .env"
    exit 1
  fi

  case "$resp" in
    *'"remaining"'*) : ;;
    *) echo "unexpected response shape - aborting"; exit 1 ;;
  esac

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
    echo "stopping - $total filled, $remaining left that YouTube won't return (deleted/private videos)"
    break
  fi
  sleep 1
done
