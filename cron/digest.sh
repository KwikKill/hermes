#!/bin/sh
# Calls POST /api/digest (app/api/digest/route.ts), which picks a handful of
# unseen items the user is likely to care about and posts them to Discord.
# Same container/network setup as refresh.sh.
set -eu

status=$(curl -sS -o /tmp/digest-response.json -w '%{http_code}' \
  -X POST "http://hermes:3000/api/digest" \
  -H "Authorization: Bearer ${HERMES_POLL_SECRET}" \
  -H "Content-Type: application/json")

echo "[digest] HTTP ${status} $(cat /tmp/digest-response.json)"

if [ "$status" -ge 400 ]; then
  exit 1
fi
