#!/bin/sh
# Calls POST /api/poll (app/api/poll/route.ts), which fetches new items from
# YouTube/AniList/RAWG for everything tracked and stores them as FeedItem
# rows. `hermes` here is the app service's own container/service name, both
# containers sit on the same `hermes` docker network, so no public hostname
# or TLS is needed.
set -eu

status=$(curl -sS -o /tmp/poll-response.json -w '%{http_code}' \
  -X POST "http://hermes:3000/api/poll" \
  -H "Authorization: Bearer ${HERMES_POLL_SECRET}" \
  -H "Content-Type: application/json")

echo "[poll] HTTP ${status} $(cat /tmp/poll-response.json)"

if [ "$status" -ge 400 ]; then
  exit 1
fi
