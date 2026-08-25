#!/bin/bash
# Start wrangler dev for E2E tests
# Usage: bash admin/scripts/e2e-start.sh

cd "$(dirname "$0")/.."

PORT=8799

# Kill any existing process on the port
if command -v lsof &> /dev/null; then
  lsof -ti:$PORT | xargs -r kill -9 2>/dev/null || true
elif command -v netstat &> /dev/null; then
  # Windows: find and kill process on port
  for pid in $(netstat -aon 2>/dev/null | grep ":$PORT" | awk '{print $5}' | sort -u); do
    taskkill //F //PID $pid 2>/dev/null || true
  done
fi

echo "Starting wrangler dev on port $PORT..."
npx wrangler dev --port $PORT --config wrangler.e2e.toml --local --log-level error &
WRANGLER_PID=$!
echo $WRANGLER_PID > worker/test/.e2e-pid

# Wait for server to be ready
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:$PORT/api/menu > /dev/null 2>&1; then
    echo "Server ready on port $PORT"
    exit 0
  fi
  sleep 1
done

echo "Server failed to start within 30s"
kill $WRANGLER_PID 2>/dev/null
exit 1
