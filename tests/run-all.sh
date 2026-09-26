#!/bin/sh
# Both suites against one test server: the Postman collection (API, via Newman), then the
# Playwright tests (UI, in Chrome). Starts tests/serve.sh unless it is already up, and stops
# what it started. Usage: npm test
set -e
cd "$(dirname "$0")/.."
URL=http://localhost:8799/api/health
STARTED=""
if ! curl -sf "$URL" >/dev/null; then
  sh tests/serve.sh >/tmp/job-tracker-test-server.log 2>&1 &
  STARTED=$!
  trap 'kill $STARTED 2>/dev/null; pkill -f "pages dev dist --port 8799" 2>/dev/null || true' EXIT
  i=0
  until curl -sf "$URL" >/dev/null; do
    i=$((i + 1))
    [ "$i" -gt 120 ] && { echo "Test server did not start; see /tmp/job-tracker-test-server.log"; exit 1; }
    sleep 1
  done
fi
npx newman run tests/api/job-tracker.postman_collection.json -e tests/api/local.postman_environment.json
npx playwright test
