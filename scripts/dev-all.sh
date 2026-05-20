#!/usr/bin/env bash
# Start API + Vite. Kill stale API on 3001 first.
set -e
cd "$(dirname "$0")/.."

for port in 3001; do
  pid=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "Stoppar gammal process på port $port (pid $pid)"
    kill -9 $pid 2>/dev/null || true
  fi
done

node api/index.js &
API_PID=$!
trap "kill $API_PID 2>/dev/null" EXIT

sleep 1
if ! curl -sf http://localhost:3001/api/health >/dev/null; then
  echo "⚠ API startade inte på port 3001 — kontrollera .env"
fi

echo "✅ API pid $API_PID — startar Vite..."
exec npx vite
