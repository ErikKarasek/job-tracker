import { Hono } from 'hono'
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

export const app = new Hono<{ Bindings: Env }>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/applications', async (c) => {
  const stage = c.req.query('stage') as Stage | undefined
  if (stage && !STAGES.includes(stage)) return c.json({ error: 'invalid stage' }, 400)
  return c.json(await listApplications(c.env.DB, stage))
})

app.post('/api/applications', async (c) => {
  const body = await c.req.json<ApplicationInput>()
  if (!body.company?.trim() || !body.role?.trim()) {
    return c.json({ error: 'company and role are required' }, 400)
  }
  if (body.stage && !STAGES.includes(body.stage)) return c.json({ error: 'invalid stage' }, 400)
  return c.json(await createApplication(c.env.DB, body), 201)
})

app.patch('/api/applications/:id', async (c) => {
  const patch = await c.req.json<Partial<ApplicationInput>>()
  if (patch.stage && !STAGES.includes(patch.stage)) return c.json({ error: 'invalid stage' }, 400)
  const updated = await updateApplication(c.env.DB, c.req.param('id'), patch)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(updated)
})

app.delete('/api/applications/:id', async (c) => {
  const deleted = await deleteApplication(c.env.DB, c.req.param('id'))
  if (!deleted) return c.json({ error: 'not found' }, 404)
  return c.body(null, 204)
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
