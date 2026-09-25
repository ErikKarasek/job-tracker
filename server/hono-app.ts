import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { ApplicationInput, Env, Stage } from './types'
import { STAGES } from './types'
import {
  createApplication,
  deleteApplication,
  getStaleApplications,
  getStatsSummary,
  getTimeline,
  listApplications,
  updateApplication,
} from './db'
import { runAgent } from './agent/run'
import { tick } from './scout/tick'
import { fetchJobPosting } from './agent/tools'
import { PHONE, cv } from './cv/content'
import { tailorCv, type Tailoring } from './cv/tailor'
import { getBrief, startBrief } from './interview/brief'
import { overBudget, recordSpend, spentToday } from './ai/budget'

export const app = new Hono<{ Bindings: Env }>()

/**
 * Reading is public — the board is linked from a portfolio case study and visitors
 * should be able to look. Changing anything is not: without this, the URL alone is
 * enough for a stranger to add, edit or delete applications.
 *
 * Fails closed. An instance with no ADMIN_KEY configured serves reads and refuses
 * writes, rather than leaving the door open until someone remembers the secret.
 */
const requireAdmin: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const expected = c.env.ADMIN_KEY
  if (!expected) {
    return c.json({ error: 'This instance is read-only: no ADMIN_KEY is configured on the server.' }, 503)
  }
  if (c.req.header('x-admin-key') !== expected) {
    return c.json({ error: 'Unlock with the admin key to change anything.' }, 401)
  }
  await next()
}

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/applications', async (c) => {
  const stage = c.req.query('stage') as Stage | undefined
  if (stage && !STAGES.includes(stage)) return c.json({ error: 'invalid stage' }, 400)
  return c.json(await listApplications(c.env.DB, stage))
})

app.post('/api/applications', requireAdmin, async (c) => {
  const body = await c.req.json<ApplicationInput>()
  if (!body.company?.trim() || !body.role?.trim()) {
    return c.json({ error: 'company and role are required' }, 400)
  }
  if (body.stage && !STAGES.includes(body.stage)) return c.json({ error: 'invalid stage' }, 400)
  return c.json(await createApplication(c.env.DB, body), 201)
})

app.patch('/api/applications/:id', requireAdmin, async (c) => {
  const patch = await c.req.json<Partial<ApplicationInput>>()
  if (patch.stage && !STAGES.includes(patch.stage)) return c.json({ error: 'invalid stage' }, 400)
  const updated = await updateApplication(c.env.DB, c.req.param('id'), patch)
  if (!updated) return c.json({ error: 'not found' }, 404)
  // Reaching Interview starts the prep brief in the background, once per card.
  if (patch.stage === 'interview' && c.env.AI && !(await getBrief(c.env.DB, updated.id)) && !(await overBudget(c.env.DB, 'brief'))) {
    const work = await startBrief({ ...c.env, AI: c.env.AI }, updated.id)
    if (work) c.executionCtx.waitUntil(work)
  }
  return c.json(updated)
})

app.delete('/api/applications/:id', requireAdmin, async (c) => {
  const deleted = await deleteApplication(c.env.DB, c.req.param('id'))
  if (!deleted) return c.json({ error: 'not found' }, 404)
  return c.body(null, 204)
})

// Behind the admin key like every write: each run spends from the account's Workers AI
// allocation, so a stranger with the URL must not be able to start one.
app.post('/api/agent/draft', requireAdmin, async (c) => {
  const body = await c.req.json<{ url?: string; text?: string }>().catch(() => ({}) as { url?: string; text?: string })
  const url = body.url?.trim() || undefined
  const text = body.text?.trim() || undefined
  if (!url && !text) return c.json({ error: 'Give a posting URL or paste its text.' }, 400)
  if (url && !/^https?:\/\//i.test(url)) return c.json({ error: 'That is not an http(s) URL.' }, 400)
  const ai = c.env.AI
  if (!ai) return c.json({ error: 'Workers AI is not bound on this deployment.' }, 503)
  const over = await overBudget(c.env.DB, 'agent')
  if (over) return c.json({ error: over }, 429)
  const result = await runAgent({ ...c.env, AI: ai }, { url, text })
  await recordSpend(c.env.DB, 'agent', result.neurons)
  return c.json(result)
})

// The scout's inbox. Behind the key even for reading: it holds cover letters, and the board's
// visitors have no business with postings Erik has not decided on.
app.get('/api/suggestions', requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, job_url AS jobUrl, title, company, location, remote, query, fit_score AS fitScore,
            fit_summary AS fitSummary, cover_letter AS coverLetter, salary_min AS salaryMin,
            salary_max AS salaryMax, found_at AS foundAt, scored_at AS scoredAt
     FROM suggestions WHERE status = 'new' ORDER BY fit_score IS NULL, fit_score DESC, found_at DESC`,
  ).all()
  const queued = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'queued'").first<{ n: number }>()
  return c.json({ suggestions: results, queued: queued?.n ?? 0 })
})

// Accepting turns the suggestion into a Wishlist card; both happen in one batch.
app.post('/api/suggestions/:id/accept', requireAdmin, async (c) => {
  const s = await c.env.DB.prepare("SELECT * FROM suggestions WHERE id = ? AND status = 'new'")
    .bind(c.req.param('id'))
    .first<Record<string, string | number | null>>()
  if (!s) return c.json({ error: 'not found' }, 404)
  const card = await createApplication(c.env.DB, {
    company: (s.company as string) ?? 'Unknown company',
    role: s.title as string,
    jobUrl: s.job_url as string,
    location: (s.remote ? `${s.location ?? ''} (remote)`.trim() : s.location) as string | null,
    salaryMin: s.salary_min as number | null,
    salaryMax: s.salary_max as number | null,
    source: 'Jobs.cz (scout)',
    fitScore: s.fit_score as number | null,
    fitSummary: s.fit_summary as string | null,
  })
  await c.env.DB.prepare("UPDATE suggestions SET status = 'accepted', decided_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), s.id)
    .run()
  return c.json(card, 201)
})

app.post('/api/suggestions/:id/dismiss', requireAdmin, async (c) => {
  const r = await c.env.DB.prepare("UPDATE suggestions SET status = 'dismissed', decided_at = ? WHERE id = ? AND status = 'new'")
    .bind(new Date().toISOString(), c.req.param('id'))
    .run()
  if (!r.meta.changes) return c.json({ error: 'not found' }, 404)
  return c.body(null, 204)
})

// One scout step on demand, the same one the morning cron runs. Lets the inbox's
// "Search now" button (and a test) drive the scout without waiting for the schedule.
app.post('/api/scout/tick', requireAdmin, async (c) => {
  const ai = c.env.AI
  if (!ai) return c.json({ error: 'Workers AI is not bound on this deployment.' }, 503)
  return c.json(await tick({ ...c.env, AI: ai }))
})

// A CV fitted to the card's posting. Behind the key: it carries the phone number, and making
// one spends from the Workers AI allocation. GET returns what was made before (free); POST makes
// it, from the posting URL on the card or, when that page cannot be read, from pasted text.
const cvResponse = (tailoring: Tailoring) => ({ tailoring, cv: cv[tailoring.lang], phone: PHONE })

app.get('/api/applications/:id/cv', requireAdmin, async (c) => {
  const row = await c.env.DB.prepare('SELECT data FROM cv_tailoring WHERE application_id = ?').bind(c.req.param('id')).first<{ data: string }>()
  if (!row) return c.json({ tailoring: null })
  return c.json(cvResponse(JSON.parse(row.data) as Tailoring))
})

app.post('/api/applications/:id/cv', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const card = await c.env.DB.prepare('SELECT job_url FROM applications WHERE id = ?').bind(id).first<{ job_url: string | null }>()
  if (!card) return c.json({ error: 'not found' }, 404)
  const ai = c.env.AI
  if (!ai) return c.json({ error: 'Workers AI is not bound on this deployment.' }, 503)

  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string })
  let posting = body.text?.trim()
  if (!posting) {
    const page = card.job_url ? await fetchJobPosting({ url: card.job_url }) : null
    if (!page?.ok) {
      return c.json({ error: 'The posting cannot be read from its link. Paste its text.', needsText: true }, 422)
    }
    posting = page.text
  }

  const over = await overBudget(c.env.DB, 'cv')
  if (over) return c.json({ error: over }, 429)
  try {
    const { tailoring, neurons } = await tailorCv(ai, posting)
    await recordSpend(c.env.DB, 'cv', neurons)
    console.log(`[cv] tailored ${id}: ${neurons} neurons`)
    await c.env.DB.prepare(
      `INSERT INTO cv_tailoring (application_id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(application_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    )
      .bind(id, JSON.stringify(tailoring), new Date().toISOString())
      .run()
    return c.json(cvResponse(tailoring))
  } catch (err) {
    if (String(err).includes('4006')) return c.json({ error: 'The Workers AI allocation for today is used up. Try again after 2:00.' }, 503)
    throw err
  }
})

// The interview brief (server/interview/). Behind the key: it is Erik's own prep. POST writes
// (or rewrites) it in the background and answers at once; the UI polls GET until it is ready.
app.get('/api/applications/:id/brief', requireAdmin, async (c) => {
  return c.json((await getBrief(c.env.DB, c.req.param('id'))) ?? { status: null })
})

app.post('/api/applications/:id/brief', requireAdmin, async (c) => {
  const ai = c.env.AI
  if (!ai) return c.json({ error: 'Workers AI is not bound on this deployment.' }, 503)
  const over = await overBudget(c.env.DB, 'brief')
  if (over) return c.json({ error: over }, 429)
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as { text?: string })
  const work = await startBrief({ ...c.env, AI: ai }, c.req.param('id'), body.text?.trim() || undefined)
  if (!work) return c.json({ error: 'The card needs a posting URL first.' }, 400)
  c.executionCtx.waitUntil(work)
  return c.json({ status: 'writing' }, 202)
})

// What the AI features spent today, shown in the Inbox so the budget is never a surprise.
app.get('/api/ai/spend', requireAdmin, async (c) => c.json(await spentToday(c.env.DB)))

app.get('/api/stats/summary', async (c) => c.json(await getStatsSummary(c.env.DB)))

app.get('/api/stats/timeline', async (c) => c.json(await getTimeline(c.env.DB)))

app.get('/api/stats/stale', async (c) => {
  const days = Number(c.req.query('days') ?? 14)
  return c.json(await getStaleApplications(c.env.DB, Number.isFinite(days) ? days : 14))
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})
