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
import { sendDigest, sendMail } from './email'
import { briefText, getBrief } from '../interview/brief'
import { MAX_PAGES, PAGE_SIZE, PLACES, SOURCES, parseResults, searchUrl, triage, type Place, type Source } from './search'

// A run measured ~340 neurons, so fifteen take about half of the 10 000 free a day, leaving the
// rest for the portfolio assistant and for adding postings by hand. The rest waits for tomorrow.
const DAILY_AGENT_RUNS = 15

export type TickResult = { step: 'remind' | 'search' | 'score' | 'digest' | 'idle'; detail: string }
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

  // 0. The day before an interview, its brief goes out by e-mail. Cheap, so it comes first.
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })
  const upcoming = await env.DB.prepare(
    "SELECT id, company, role, job_url FROM applications WHERE interview_at = ? AND stage = 'interview'",
  )
    .bind(tomorrow)
    .all<{ id: string; company: string; role: string; job_url: string | null }>()
  for (const card of upcoming.results) {
    const step = `remind:${card.id}`
    if (done.has(step)) continue
    await mark(step)
    const brief = await getBrief(env.DB, card.id)
    const body =
      brief?.status === 'ready' && brief.brief
        ? briefText(brief.brief)
        : 'Podklady k pohovoru zatím nejsou hotové. Otevři kartu v Job Trackeru a nech je napsat.'
    const sent = await sendMail(env, `Zítra pohovor: ${card.role}, ${card.company}`, `${body}\n\n${card.job_url ?? ''}`)
    return { step: 'remind', detail: `interview reminder for ${card.company}: ${sent}` }
  }

  // 1. The next results page not yet read today. Page n+1 only when page n came back full.
  for (const source of SOURCES) {
    for (const place of PLACES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const step = `search:${source.key}:${place}:${page}`
        if (done.has(step)) continue
        if (page > 1 && !done.has(`search:${source.key}:${place}:${page - 1}:full`)) break
        // Marked first: a search that keeps failing is skipped for today, not retried every tick.
        await mark(step)
        try {
          const { cards, added } = await search(env, source, place, page)
          if (cards >= PAGE_SIZE) await mark(`${step}:full`)
          return { step: 'search', detail: `${source.label} (${place}) page ${page}: ${cards} found, ${added} new` }
        } catch (err) {
          return { step: 'search', detail: `${source.label} (${place}) page ${page} failed: ${String(err)}` }
        }
      }
    }
  }

  // 2. Score the next queued posting, while today's agent runs last. Pages that cannot be read
  // cost no agent run, so one tick moves past up to five of them to reach one it can score.
  const runsToday = [...done].filter((s) => s.startsWith('score:')).length
  if (runsToday < DAILY_AGENT_RUNS && !done.has('quota')) {
    for (let i = 0; i < 5; i++) {
      const next = await env.DB.prepare(
        "SELECT id, job_url, title FROM suggestions WHERE status = 'queued' ORDER BY priority DESC, found_at ASC LIMIT 1",
      ).first<{ id: string; job_url: string; title: string }>()
      if (!next) break
      const runStep = `score:${next.id}`
      try {
        const ranAgent = await score(env, next.id, next.job_url, () => mark(runStep))
        if (ranAgent || i === 4) return { step: 'score', detail: next.title }
      } catch (err) {
        // The day's Workers AI allocation is shared with the portfolio assistant and can run out
        // before the scout's own cap. Then stop scoring for today, and give back the run the
        // failed attempt took, rather than burning a run per tick on the same error.
        if (String(err).includes('4006')) {
          await env.DB.prepare('DELETE FROM scout_log WHERE day = ? AND step = ?').bind(day, runStep).run()
          await mark('quota')
          return { step: 'score', detail: 'The Workers AI allocation for today is used up; scoring continues tomorrow.' }
        }
        return { step: 'score', detail: `${next.title} failed: ${String(err)}` }
      }
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
    if (fresh.results.length === 0) {
      // Nothing scored. If that is because the allocation ran out, the morning still found
      // postings and silence would read as "the scout is broken" — so send what is waiting,
      // unscored, rather than nothing at all.
      if (!done.has('quota')) return { step: 'digest', detail: 'nothing new today, no e-mail' }
      const waiting = await env.DB.prepare(
        "SELECT title, company, location, remote, job_url FROM suggestions WHERE status = 'queued' ORDER BY priority DESC, found_at ASC LIMIT 10",
      ).all<{ title: string; company: string | null; location: string | null; remote: number; job_url: string }>()
      if (waiting.results.length === 0) return { step: 'digest', detail: 'nothing queued, no e-mail' }
      const list = waiting.results
        .map((r) => `${r.title}\n${[r.company, r.location, r.remote ? 'z domova' : null].filter(Boolean).join(' · ')}\n${r.job_url}`)
        .join('\n\n')
      const sent = await sendMail(
        env,
        'Scout dnes nestihl hodnotit (došel denní limit AI)',
        `Denní příděl Workers AI je vyčerpaný, takže dnešní nabídky zůstaly neohodnocené. Hodnocení pokračuje zítra.\n\nCo čeká ve frontě (nejslibnější nahoře):\n\n${list}\n\nCelá fronta je v Inboxu: https://job-tracker-10s.pages.dev\n`,
      )
      return { step: 'digest', detail: `unscored digest: ${sent}` }
    }
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

async function search(env: Env, source: Source, place: Place, page: number) {
  const res = await fetch(searchUrl(source, place, page), {
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
      ).bind(crypto.randomUUID(), f.url, f.title, f.company, f.location, f.remote ? 1 : 0, source.label, ...triaged(f.title), now),
    )
  if (inserts.length === 0) return { cards: found.length, added: 0 }
  const results = await env.DB.batch(inserts)
  return { cards: found.length, added: results.reduce((n, r) => n + (r.meta.changes ?? 0), 0) }
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
