// The job scout: finds postings on its own every morning and scores them with the agent.
//
// It works in small steps, one per call of tick(), with all state in D1. A cron fires tick()
// every five minutes through the morning (scout/wrangler.toml); each call does the first thing
// still left today and returns. Small steps because a free-plan Worker gets 10 ms of CPU per
// invocation, and because a step that fails is simply picked up again by the next one.
//
// Order of work each day: every search once, then the agent on queued postings up to a daily
// cap, then one digest e-mail. Nothing reaches the board without Erik: scored postings wait in
// the inbox for him to accept or dismiss.
import { runAgent } from '../agent/run'
import { fetchJobPosting } from '../agent/tools'
import type { Env } from '../types'
import { sendDigest } from './email'
import { PLACES, QUERIES, parseResults, searchUrl, triage, type Place } from './search'

// A run measured ~340 neurons, so ten stay well inside the 10 000 free a day, with room left
// for the portfolio assistant and for adding postings by hand. The rest waits for tomorrow.
const DAILY_AGENT_RUNS = 10

export type TickResult = { step: 'search' | 'score' | 'digest' | 'idle'; detail: string }
export type ScoutEnv = Env & { AI: Ai; RESEND_API_KEY?: string; NOTIFY_EMAIL?: string }

/** Prague-local calendar day, so "today" turns over at midnight here, not in UTC. */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })

export async function tick(env: ScoutEnv): Promise<TickResult> {
  const day = today()
  const done = new Set(
    (await env.DB.prepare('SELECT step FROM scout_log WHERE day = ?').bind(day).all<{ step: string }>()).results.map((r) => r.step),
  )
  const mark = (step: string) =>
    env.DB.prepare('INSERT OR IGNORE INTO scout_log (day, step, at) VALUES (?, ?, ?)').bind(day, step, new Date().toISOString()).run()

  // 1. The next search not yet run today.
  for (const query of QUERIES) {
    for (const place of Object.keys(PLACES) as Place[]) {
      const step = `search:${place}:${query}`
      if (done.has(step)) continue
      // Marked first: a search that keeps failing is skipped for today, not retried every tick.
      await mark(step)
      try {
        const added = await search(env, query, place)
        return { step: 'search', detail: `${query} (${place}): ${added} new` }
      } catch (err) {
        return { step: 'search', detail: `${query} (${place}) failed: ${String(err)}` }
      }
    }
  }

  // 2. Score the next queued posting, while today's agent runs last. Pages that cannot be read
  // cost no agent run, so one tick moves past up to five of them to reach one it can score.
  const runsToday = [...done].filter((s) => s.startsWith('score:')).length
  if (runsToday < DAILY_AGENT_RUNS) {
    for (let i = 0; i < 5; i++) {
      const next = await env.DB.prepare(
        "SELECT id, job_url, title FROM suggestions WHERE status = 'queued' ORDER BY priority DESC, found_at ASC LIMIT 1",
      ).first<{ id: string; job_url: string; title: string }>()
      if (!next) break
      const ranAgent = await score(env, next.id, next.job_url, () => mark(`score:${next.id}`))
      if (ranAgent || i === 4) return { step: 'score', detail: next.title }
    }
  }

  // 3. The digest, once, if today turned anything up.
  if (!done.has('digest')) {
    await mark('digest')
    const fresh = await env.DB.prepare(
      "SELECT title, company, location, remote, job_url, fit_score, fit_summary FROM suggestions WHERE status = 'new' AND scored_at >= ? ORDER BY fit_score DESC",
    )
      .bind(`${day}T00:00:00`)
      .all<DigestRow>()
    if (fresh.results.length === 0) return { step: 'digest', detail: 'nothing new today, no e-mail' }
    const sent = await sendDigest(env, fresh.results)
    return { step: 'digest', detail: sent }
  }

  return { step: 'idle', detail: 'everything for today is done' }
}

export type DigestRow = {
  title: string
  company: string | null
  location: string | null
  remote: number
  job_url: string
  fit_score: number | null
  fit_summary: string | null
}

async function search(env: Env, query: string, place: Place) {
  const res = await fetch(searchUrl(query, place), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerScout/1.0)', 'Accept-Language': 'cs' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Jobs.cz search answered HTTP ${res.status}`)
  const found = parseResults(await res.text(), place)
  const now = new Date().toISOString()

  // Already on the board, by URL: nothing to suggest.
  const onBoard = new Set(
    (await env.DB.prepare('SELECT job_url FROM applications WHERE job_url IS NOT NULL').all<{ job_url: string }>()).results.map((r) =>
      r.job_url,
    ),
  )
  // Companies repost the same role under a new id; one suggestion per title and company is enough.
  const known = new Set(
    (await env.DB.prepare(`SELECT lower(title) || ' | ' || lower(coalesce(company, '')) AS k FROM suggestions`).all<{ k: string }>()).results.map(
      (r) => r.k,
    ),
  )
  const inserts = found
    .filter((f) => !onBoard.has(f.url))
    .filter((f) => {
      const k = `${f.title.toLowerCase()} | ${(f.company ?? '').toLowerCase()}`
      if (known.has(k)) return false
      known.add(k)
      return true
    })
    .map((f) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO suggestions (id, job_url, title, company, location, remote, query, status, priority, found_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), f.url, f.title, f.company, f.location, f.remote ? 1 : 0, query, ...triaged(f.title), now),
    )
  if (inserts.length === 0) return 0
  const results = await env.DB.batch(inserts)
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0)
}

function triaged(title: string): [string, number] {
  const t = triage(title)
  return [t.skip ? 'skipped' : 'queued', t.priority]
}

/** Returns whether the agent ran; `countRun` is called just before it does. */
async function score(env: ScoutEnv, id: string, url: string, countRun: () => Promise<unknown>): Promise<boolean> {
  const now = new Date().toISOString()
  // Read the page before involving the model: half the postings in testing were company pages
  // drawn with JavaScript, and asking the agent to find that out cost a turn each time.
  const page = await fetchJobPosting({ url })
  if (!page.ok) {
    await env.DB.prepare(`UPDATE suggestions SET status = 'new', fit_summary = ?, scored_at = ? WHERE id = ?`)
      .bind('Not scored: the posting page cannot be read automatically. Open it to judge it yourself.', now, id)
      .run()
    console.log(`[scout] ${url}: unreadable, no agent run`)
    return false
  }
  await countRun()
  const result = await runAgent(env, { url, text: page.text })
  if (result.status === 'draft') {
    const d = result.draft
    await env.DB.prepare(
      `UPDATE suggestions SET status = 'new', fit_score = ?, fit_summary = ?, cover_letter = ?, salary_min = ?, salary_max = ?,
         company = coalesce(?, company), location = coalesce(?, location), scored_at = ? WHERE id = ?`,
    )
      .bind(d.fitScore, d.fitSummary, d.coverLetter, d.salaryMin, d.salaryMax, d.company, d.location, now, id)
      .run()
  } else {
    // Could not be read or scored (usually a posting drawn with JavaScript). Still worth a look,
    // so it goes to the inbox unscored rather than disappearing.
    await env.DB.prepare(`UPDATE suggestions SET status = 'new', fit_summary = ?, scored_at = ? WHERE id = ?`)
      .bind(`Not scored: ${result.message.slice(0, 200)}`, now, id)
      .run()
  }
  console.log(`[scout] scored ${url}: ${result.status}, ${result.neurons} neurons`)
  return true
}
