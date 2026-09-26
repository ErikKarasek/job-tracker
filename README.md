# Job Tracker

A kanban board for a job hunt. Every role is a card you move through the stages —
wishlist → applied → interview → offer or rejected — and above the board sit stats that
count from the *history* of those moves rather than from where a card happens to sit today.

Live: **https://job-tracker-10s.pages.dev** (read-only unless you hold the admin key)
Case study: **https://erikkarasek.cz/job-tracker**

## Why the funnel counts history

A spreadsheet tells you where each application is now. It cannot tell you whether the
problem is that you apply too rarely or that nobody wants you after the interview — because
an application rejected after an interview looks, in the "rejected" column, exactly like one
rejected on the CV.

So every stage change is appended to `status_events`, and the funnel counts how many
applications ever *reached* a stage. A rejection after an interview still counts towards the
interview rate. The same log drives the per-day timeline.

## What it does

- **Board** — five columns, one per stage; a card carries company, role, a link to the
  posting, location, salary range, source and notes.
- **Goes-quiet watch** — anything with no activity for N days (default 14) is flagged on the
  card itself, not buried in a report. Offers and rejections are excluded: nothing to chase.
- **Stats** — stage-to-stage rates, how many applications reached each stage, applications
  started per day, and the list that needs a follow-up.
- **Agent** — paste a posting's URL and a model with tools fetches the page, checks the board
  for an existing application at that company, and hands back a draft card with a fit score
  and a short cover letter in the posting's language.
- **Scout** — every morning it searches Jobs.cz on its own and leaves what it finds, scored,
  in an inbox. Accepting a card puts it on the board; nothing lands there unreviewed.
- **Fitted résumé** — a button on a card reorders the résumé's projects, skills and
  technologies for that posting and rewrites the headline and profile. The names it returns
  are checked against the real résumé, so it can reorder but not invent or drop; the browser's
  print dialog saves the PDF.

## The agent and the scout

The agent (`server/agent/`) is a model in a loop with three tools — `fetch_job_posting`,
`find_applications`, `submit_draft` — running on Workers AI (Mistral Small 3.1, picked in a
side-by-side for tool calling and for writing natural Czech). It stops when it submits a
draft, six turns at most. Nothing is written to the board there: saving stays a human
decision made in the UI.

The scout (`server/scout/`) is that agent on a schedule. Pages Functions cannot run on a
cron, so `scout/index.ts` is a separate Worker sharing the same D1 and code. A cron fires
`tick()` every five minutes through the morning and each call does the first thing still
left today — the next page of results, the next posting to score, or the digest e-mail —
recording each step in `scout_log` so nothing is done twice. Small steps because a free-plan
Worker gets 10 ms of CPU per invocation, and because a step that fails is simply picked up
by the next one.

What keeps it cheap: it searches Jobs.cz's own IT fields rather than by keyword (full-text
"QA" mostly found factory quality control), drops senior and non-IT titles with a regex
before any model call, reads the page before involving the model, and caps the day at 15
agent runs — about half the free Workers AI allowance, leaving the rest for the assistant on
the portfolio. When the allowance runs out it stops cleanly and carries on tomorrow.

Deploy it, once the Pages app is up:

```bash
npx wrangler secret put RESEND_API_KEY -c scout/wrangler.toml   # for the digest e-mail
npm run deploy:scout
```

`NOTIFY_EMAIL` (where the digest goes) and the cron window live in `scout/wrangler.toml`.
The inbox is behind the admin key even for reading — it holds cover letters — and its
"Search now" button runs one scout step on demand.

## Stack

React 19 + Vite + Tailwind v4 on the front; a [Hono](https://hono.dev) API running as a
Cloudflare Pages Function on a catch-all `/api/*` route; data in Cloudflare D1; the models on
Cloudflare Workers AI through an `AI` binding, so there is no API key to keep. TypeScript
throughout, with `Application` and `Stage` shared by both halves, so renaming a stage fails
the build until it is carried through everywhere. No state-management library — one hook,
`useBoardData`, over `fetch`.

Both halves ship in a single deploy, so there is never a window where the site is newer
than the API.

## Running it locally

```bash
npm install
npm run db:local          # create the schema in the local D1
npm run dev               # Vite only — no API
```

For the API and the board together, use the Cloudflare runtime:

```bash
npm run build
npx wrangler pages dev dist --d1 DB=job-tracker-db
```

Put the admin key in `.dev.vars` (git-ignored) so local writes work:

```
ADMIN_KEY=anything-you-like
```

## Tests

Two suites run against a test server (`tests/serve.sh`): a fresh build served by wrangler on
port 8799 with its own D1 state in `.wrangler/e2e-state`, so your development data is never
touched. The admin key there is `e2e`. No test calls Workers AI.

- **API, Postman:** `tests/api/job-tracker.postman_collection.json`, 18 requests with 33
  assertions: public reads, access control (writes and the inbox refuse a missing or wrong key),
  the full lifecycle of an application (create, invalid input, stage moves, funnel, delete),
  and the agent's input validation. Open it in Postman with `tests/api/local.postman_environment.json`,
  or run it with Newman.
- **UI, Playwright:** `tests/e2e/board.spec.ts` drives the board in Chrome: what a visitor
  without the key sees, unlocking through the prompt, an application from wishlist to applied
  (surviving a reload), edited and deleted, the funnel in Stats, and a wrong key being refused.

```sh
npm test            # both suites; starts and stops the test server itself
npm run test:api    # the Postman collection only (test server must be running)
npm run test:e2e    # Playwright only
```

Both run on every push in GitHub Actions (`.github/workflows/test.yml`). CI has no Cloudflare
login, which the remote Workers AI binding needs to start, so the workflow drops that binding
from `wrangler.toml` first; the routes that need it answer 503 and no test depends on them.

## Access control

Reading is public — the board is linked from a portfolio case study and visitors should be
able to look at it. Everything that changes data requires a shared secret in an
`x-admin-key` header.

It **fails closed**: an instance with no `ADMIN_KEY` configured serves reads and refuses
every write with a 503, rather than staying open until someone remembers to set it.

Set the secret on the deployed instance:

```bash
npx wrangler pages secret put ADMIN_KEY --project-name job-tracker
```

In the browser, the "Read-only" button in the top bar asks for the key and keeps it in
`localStorage` for that browser only. It is never part of the bundle. Editing controls stay
hidden until it is entered.

This is a shared secret, not user accounts: it is the right size of lock for a single-person
tool whose data is a list of job applications, and the wrong one for anything else.

## Database

`migrations/0001_init.sql` creates the two tables the board itself needs:

- `applications` — the applications themselves, including `stage` and `last_activity_at`.
- `status_events` — one row per stage change (`from_stage` is `NULL` for the creation),
  which is what the funnel and the timeline are computed from.

The later migrations add the rest, in order: `0002_fit.sql` (the agent's fit score and cover
letter), `0003_scout.sql` (the inbox and `scout_log`), `0004_cv.sql` (the fitted résumé,
cached per card). Apply each one with `wrangler d1 execute job-tracker-db --remote
--file=./migrations/<name>.sql`; `npm run db:remote` only runs the first.

## Deploying

```bash
npm run build
npx wrangler pages deploy dist --project-name job-tracker --branch main
```

The D1 binding lives on the Pages project itself, per environment — the production
environment has it; a preview branch needs its own or the API returns 500.

## Licence

No licence yet: all rights reserved. Read it, learn from it, ask before reusing it.
