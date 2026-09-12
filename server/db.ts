import type { Application, ApplicationInput, Stage, StatsSummary, TimelinePoint } from './types'
import { STAGES } from './types'

interface ApplicationRow {
  id: string
  company: string
  role: string
  job_url: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  source: string | null
  notes: string | null
  stage: Stage
  applied_date: string | null
  last_activity_at: string
  created_at: string
  updated_at: string
}

function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    jobUrl: row.job_url,
    location: row.location,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    source: row.source,
    notes: row.notes,
    stage: row.stage,
    appliedDate: row.applied_date,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listApplications(db: D1Database, stage?: Stage): Promise<Application[]> {
  const query = stage
    ? db.prepare('SELECT * FROM applications WHERE stage = ? ORDER BY last_activity_at DESC').bind(stage)
    : db.prepare('SELECT * FROM applications ORDER BY last_activity_at DESC')
  const { results } = await query.all<ApplicationRow>()
  return results.map(rowToApplication)
}

export async function getApplication(db: D1Database, id: string): Promise<Application | null> {
  const row = await db.prepare('SELECT * FROM applications WHERE id = ?').bind(id).first<ApplicationRow>()
  return row ? rowToApplication(row) : null
}

export async function createApplication(db: D1Database, input: ApplicationInput): Promise<Application> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const stage = input.stage ?? 'wishlist'
  await db
    .prepare(
      `INSERT INTO applications
        (id, company, role, job_url, location, salary_min, salary_max, source, notes, stage, applied_date, last_activity_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.company,
      input.role,
      input.jobUrl ?? null,
      input.location ?? null,
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.source ?? null,
      input.notes ?? null,
      stage,
      input.appliedDate ?? null,
      now,
      now,
      now,
    )
    .run()
  await logStatusEvent(db, id, null, stage, now)
  return (await getApplication(db, id))!
}

const PATCHABLE_FIELDS: Array<[keyof ApplicationInput, string]> = [
  ['company', 'company'],
  ['role', 'role'],
  ['jobUrl', 'job_url'],
  ['location', 'location'],
  ['salaryMin', 'salary_min'],
  ['salaryMax', 'salary_max'],
  ['source', 'source'],
  ['notes', 'notes'],
  ['appliedDate', 'applied_date'],
]

export async function updateApplication(
  db: D1Database,
  id: string,
  patch: Partial<ApplicationInput>,
): Promise<Application | null> {
  const existing = await getApplication(db, id)
  if (!existing) return null

  const now = new Date().toISOString()
  const sets: string[] = ['last_activity_at = ?', 'updated_at = ?']
  const values: unknown[] = [now, now]

  for (const [key, column] of PATCHABLE_FIELDS) {
    if (key in patch) {
      sets.push(`${column} = ?`)
      values.push(patch[key] ?? null)
    }
  }

  const stageChanged = patch.stage !== undefined && patch.stage !== existing.stage
  if (stageChanged) {
    sets.push('stage = ?')
    values.push(patch.stage)
    // Applying for the first time via a stage move sets applied_date if it wasn't set already.
    if (patch.stage === 'applied' && !existing.appliedDate && !('appliedDate' in patch)) {
      sets.push('applied_date = ?')
      values.push(now)
    }
  }

  values.push(id)
  await db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run()

  if (stageChanged && patch.stage) {
    await logStatusEvent(db, id, existing.stage, patch.stage, now)
  }

  return getApplication(db, id)
}

export async function deleteApplication(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM applications WHERE id = ?').bind(id).run()
  return result.meta.changes > 0
}

async function logStatusEvent(db: D1Database, applicationId: string, fromStage: Stage | null, toStage: Stage, occurredAt: string) {
  await db
    .prepare('INSERT INTO status_events (application_id, from_stage, to_stage, occurred_at) VALUES (?, ?, ?, ?)')
    .bind(applicationId, fromStage, toStage, occurredAt)
    .run()
}

export async function getStatsSummary(db: D1Database): Promise<StatsSummary> {
  const { results } = await db.prepare('SELECT stage, COUNT(*) as count FROM applications GROUP BY stage').all<{
    stage: Stage
    count: number
  }>()

  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
  let totalCount = 0
  for (const row of results) {
    stageCounts[row.stage] = row.count
    totalCount += row.count
  }

  // Funnel counts "reached this stage at least once" from status_events, not current stage —
  // an application rejected after interviewing still counts as having reached Interview.
  const { results: reached } = await db
    .prepare(
      `SELECT to_stage as stage, COUNT(DISTINCT application_id) as count
       FROM status_events WHERE to_stage IN ('applied','interview','offer') GROUP BY to_stage`,
    )
    .all<{ stage: Stage; count: number }>()
  const reachedCounts = Object.fromEntries(reached.map((r) => [r.stage, r.count])) as Partial<Record<Stage, number>>

  const pct = (num: number | undefined, den: number | undefined) =>
    num != null && den != null && den > 0 ? Math.round((num / den) * 1000) / 10 : null

  return {
    totalCount,
    stageCounts,
    stagesReached: {
      applied: reachedCounts.applied ?? 0,
      interview: reachedCounts.interview ?? 0,
      offer: reachedCounts.offer ?? 0,
    },
    funnel: {
      appliedToInterviewPct: pct(reachedCounts.interview, reachedCounts.applied),
      interviewToOfferPct: pct(reachedCounts.offer, reachedCounts.interview),
      appliedToOfferPct: pct(reachedCounts.offer, reachedCounts.applied),
    },
  }
}

export async function getTimeline(db: D1Database): Promise<TimelinePoint[]> {
  const { results } = await db
    .prepare(
      `SELECT date(occurred_at) as date, COUNT(*) as count
       FROM status_events WHERE from_stage IS NULL GROUP BY date(occurred_at) ORDER BY date`,
    )
    .all<{ date: string; count: number }>()
  return results
}

export async function getStaleApplications(db: D1Database, days: number): Promise<Application[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const { results } = await db
    .prepare(
      `SELECT * FROM applications
       WHERE last_activity_at < ? AND stage NOT IN ('offer', 'rejected')
       ORDER BY last_activity_at ASC`,
    )
    .bind(cutoff)
    .all<ApplicationRow>()
  return results.map(rowToApplication)
}
