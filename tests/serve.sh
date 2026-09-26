#!/bin/sh
# The app as the tests see it: a fresh build, served by wrangler on :8799 with its own D1 state
# (.wrangler/e2e-state), so tests never touch the data you use while developing. The admin key
# is "e2e". No Workers AI calls happen in tests; in CI the AI binding is cut from wrangler.toml
# first (see .github/workflows/test.yml), since it needs a Cloudflare login to start.
set -e
cd "$(dirname "$0")/.."
STATE=.wrangler/e2e-state
npm run build >/dev/null
for f in migrations/*.sql; do
  # Re-running a migration on an existing test database fails harmlessly; fresh ones apply.
  npx --yes wrangler@4 d1 execute job-tracker-db --local --persist-to "$STATE" --file="$f" >/dev/null 2>&1 || true
done
exec npx --yes wrangler@4 pages dev dist --port 8799 --persist-to "$STATE" --binding ADMIN_KEY=e2e
