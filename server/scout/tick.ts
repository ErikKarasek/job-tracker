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
import { overBudget, recordSpend } from '../ai/budget'
import { fetchJobPosting } from '../agent/tools'
import type { Env } from '../types'
import { sendDigest, sendMail } from './email'
import { parseSalary, scoreFit } from './score'
import { briefText, getBrief } from '../interview/brief'
import { MAX_PAGES, PAGE_SIZE, PLACES, SOURCES, parseResults, searchUrl, triage, type Place, type Source } from './search'

// A score costs ~20 neurons (score.ts), so thirty a day is ~600, a fraction of the 10 000 the
// plan includes. The cap is for the queue's first days, when it holds a hundred and more.
const DAILY_AGENT_RUNS = 30

export type TickResult = { step: 'remind' | 'search' | 'score' | 'digest' | 'idle'; detail: string }
export type ScoutEnv = Env & { AI: Ai; RESEND_API_KEY?: string; NOTIFY_EMAIL?: string }

/** Prague-local calendar day, so "today" turns over at midnight here, not in UTC. */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' })

export async function tick(env: ScoutEnv): Promise<TickResult> {
  const day = today()
  const log = (await env.DB.prepare('SELECT step, at FROM scout_log WHERE day = ?').bind(day).all<{ step: string; at: string }>()).results
  const done = new Set(log.map((r) => r.step))
  // Hitting the AI limit pauses scoring for an hour, not for the day: on 2026-09-25 a morning
  // mark kept the scout idle all day, long after the plan upgrade had lifted the limit.
  const quotaAt = log.find((r) => r.step === 'quota')?.at
  const paused = quotaAt !== undefined && Date.now() - Date.parse(quotaAt) < 60 * 60 * 1000
  const pause = () =>
    env.DB.prepare('INSERT OR REPLACE INTO scout_log (day, step, at) VALUES (?, ?, ?)').bind(day, 'quota', new Date().toISOString()).run()
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

  // 2. Score queued postings, best first, while today's runs last. A score is quick and cheap
  // (score.ts), so one tick scores up to three; pages that cannot be read cost nothing and are
  // moved past, up to eight postings a tick in all.
  const runsToday = [...done].filter((s) => s.startsWith('score:')).length
  const budget = runsToday < DAILY_AGENT_RUNS && !paused ? await overBudget(env.DB, 'scout') : null
  if (budget) {
    await pause()
    return { step: 'score', detail: budget }
  }
  if (runsToday < DAILY_AGENT_RUNS && !paused) {
    const scored: string[] = []
    for (let i = 0; i < 8 && scored.length < 3 && runsToday + scored.length < DAILY_AGENT_RUNS; i++) {
      const next = await env.DB.prepare(
        "SELECT id, job_url, title FROM suggestions WHERE status = 'queued' ORDER BY priority DESC, found_at ASC LIMIT 1",
      ).first<{ id: string; job_url: string; title: string }>()
      if (!next) break
      const runStep = `score:${next.id}`
      try {
        if (await score(env, next.id, next.job_url, () => mark(runStep))) scored.push(next.title)
      } catch (err) {
        // The day's Workers AI allocation is shared with the portfolio assistant and can run out
        // before the scout's own cap. Then stop scoring for today, and give back the run the
        // failed attempt took, rather than burning a run per tick on the same error.
        if (String(err).includes('4006')) {
          await env.DB.prepare('DELETE FROM scout_log WHERE day = ? AND step = ?').bind(day, runStep).run()
          await pause()
          return { step: 'score', detail: 'The Workers AI limit is reached; scoring pauses for an hour and tries again.' }
        }
        // Any other failure (a reply that is not the JSON asked for): put the posting in the inbox
        // unscored, so it is neither lost nor retried on every tick.
        await env.DB.prepare(`UPDATE suggestions SET status = 'new', fit_summary = ?, scored_at = ? WHERE id = ?`)
          .bind(`Not scored: ${String(err).slice(0, 150)}`, new Date().toISOString(), next.id)
          .run()
      }
    }
    if (scored.length > 0) return { step: 'score', detail: scored.join(' · ') }
    // Only unreadable pages this tick: carry on next tick while anything is left to score.
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'queued'").first<{ n: number }>()
    if ((left?.n ?? 0) > 0) return { step: 'score', detail: 'unreadable postings moved to the inbox' }
  }

  // While scoring is paused and the morning window (until 08:55 UTC) still has room, hold the
  // digest: it should carry scores, and a paused hour usually ends inside the window.
  if (paused && !done.has('digest') && new Date().getUTCHours() < 8) {
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'queued'").first<{ n: number }>()
    if ((left?.n ?? 0) > 0) return { step: 'idle', detail: 'Scoring is paused for an hour (AI limit); the digest waits for it.' }
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
  // A small model judges the fit; code reads the salary (see score.ts for why). The cover
  // letter is written with the better model only when Erik opens the suggestion and asks.
  const { fitScore, fitSummary, neurons } = await scoreFit(env.AI, page.text)
  await recordSpend(env.DB, 'scout', neurons)
  const salary = parseSalary(page.text)
  await env.DB.prepare(
    `UPDATE suggestions SET status = 'new', fit_score = ?, fit_summary = ?, salary_min = ?, salary_max = ?, scored_at = ? WHERE id = ?`,
  )
    .bind(fitScore, fitSummary, salary.min, salary.max, now, id)
    .run()
  console.log(`[scout] scored ${url}: ${fitScore}, ${neurons} neurons`)
  return true
}
