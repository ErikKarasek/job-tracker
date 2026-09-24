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
  return c.json(await runAgent({ ...c.env, AI: ai }, { url, text }))
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
