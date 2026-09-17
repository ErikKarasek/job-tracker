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

## Stack

React 19 + Vite + Tailwind v4 on the front; a [Hono](https://hono.dev) API running as a
Cloudflare Pages Function on a catch-all `/api/*` route; data in Cloudflare D1. TypeScript
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

Two tables, created by `migrations/0001_init.sql`:

- `applications` — the applications themselves, including `stage` and `last_activity_at`.
- `status_events` — one row per stage change (`from_stage` is `NULL` for the creation),
  which is what the funnel and the timeline are computed from.

Apply the schema to the deployed database with `npm run db:remote`.

## Deploying

```bash
npm run build
npx wrangler pages deploy dist --project-name job-tracker --branch main
```

The D1 binding lives on the Pages project itself, per environment — the production
environment has it; a preview branch needs its own or the API returns 500.

## Licence

No licence yet: all rights reserved. Read it, learn from it, ask before reusing it.
