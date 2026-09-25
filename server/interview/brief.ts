// Writing, storing and mailing interview briefs. A brief takes the agent 20-60 seconds, so it is
// written in the background (waitUntil) and the UI polls; moving a card to Interview starts one.
import type { Env } from '../types'
import { writeBrief, type Brief } from './agent'
import { recordSpend } from '../ai/budget'

export type BriefRow = { status: 'writing' | 'ready' | 'failed'; brief: Brief | null; error: string | null; createdAt: string }

export async function getBrief(db: D1Database, id: string): Promise<BriefRow | null> {
  const row = await db
    .prepare('SELECT status, data, error, created_at FROM interview_briefs WHERE application_id = ?')
    .bind(id)
    .first<{ status: BriefRow['status']; data: string | null; error: string | null; created_at: string }>()
  if (!row) return null
  return { status: row.status, brief: row.data ? (JSON.parse(row.data) as Brief) : null, error: row.error, createdAt: row.created_at }
}

/** Marks the brief as being written and returns the work to hand to waitUntil. */
export async function startBrief(env: Env & { AI: Ai }, id: string, text?: string): Promise<Promise<void> | null> {
  const card = await env.DB.prepare('SELECT company, job_url FROM applications WHERE id = ?').bind(id).first<{ company: string; job_url: string | null }>()
  if (!card?.job_url) return null
  const now = new Date().toISOString()
  await env.DB.prepare(
    `INSERT INTO interview_briefs (application_id, status, data, error, created_at) VALUES (?, 'writing', NULL, NULL, ?)
     ON CONFLICT(application_id) DO UPDATE SET status = 'writing', error = NULL, created_at = excluded.created_at`,
  )
    .bind(id, now)
    .run()

  return (async () => {
    try {
      const { brief, neurons } = await writeBrief(env.AI, card.company, card.job_url!, text)
      await recordSpend(env.DB, 'brief', neurons)
      console.log(`[brief] ${id}: ready, ${brief.sources.length} pages, ${neurons} neurons`)
      await env.DB.prepare("UPDATE interview_briefs SET status = 'ready', data = ?, error = NULL WHERE application_id = ?")
        .bind(JSON.stringify(brief), id)
        .run()
    } catch (err) {
      const message = String(err).includes('4006')
        ? 'The Workers AI allocation for today is used up. Try again after 2:00.'
        : String(err instanceof Error ? err.message : err)
      console.error(`[brief] ${id}: failed`, err)
      await env.DB.prepare("UPDATE interview_briefs SET status = 'failed', error = ? WHERE application_id = ?").bind(message, id).run()
    }
  })()
}

/** The brief as plain text, for the reminder e-mail. */
export function briefText(b: Brief) {
  const qs = b.questions.map((q, i) => `${i + 1}. ${q.question}\n   → ${q.answer}`).join('\n\n')
  return [
    `FIRMA\n${b.company}`,
    `ROLE\n${b.role}`,
    `PRAVDĚPODOBNÉ OTÁZKY\n${qs}`,
    b.topics.length ? `ZOPAKOVAT SI\n${b.topics.map((t) => `- ${t}`).join('\n')}` : '',
    b.gaps.length ? `NA CO SE PŘIPRAVIT\n${b.gaps.map((g) => `- ${g.gap}: ${g.handle}`).join('\n')}` : '',
    b.ask.length ? `ZEPTEJ SE JICH\n${b.ask.map((a) => `- ${a}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
