#!/usr/bin/env bash
# Start API + Vite. Kill stale API on 3001 first.
set -e
cd "$(dirname "$0")/.."

echo "Stoppar alla processer på port 3001..."
for pid in $(lsof -ti:3001 2>/dev/null || true); do
  echo "  kill pid $pid"
  kill -9 "$pid" 2>/dev/null || true
done
sleep 0.5

node api/index.js &
API_PID=$!
trap "kill $API_PID 2>/dev/null" EXIT

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
    VERSION=$(curl -sf http://localhost:3001/api/health | python3 -c "import json,sys; print(json.load(sys.stdin).get('apiVersion','?'))" 2>/dev/null || echo "?")
    echo "✅ API pid $API_PID — apiVersion: $VERSION"
    if [ "$VERSION" = "2-async-search" ]; then
      echo "⚠ Gammal API-kod körs — stoppa alla 'node api/index.js' och kör dev:all igen"
    fi
    break
  fi
  sleep 0.5
done

if ! curl -sf http://localhost:3001/api/health >/dev/null; then
  echo "⚠ API startade inte på port 3001 — kontrollera .env"
  exit 1
fi

echo "Startar Vite (proxy /api → :3001)..."
exec npx vite
