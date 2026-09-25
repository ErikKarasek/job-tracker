// Follow-ups for applications that went quiet. A polite nudge after a week of silence measurably
// gets more answers, and it is exactly the kind of chore that slips; so the scout finds the quiet
// ones each morning and drafts the message. Sending stays with Erik: he knows the channel (a reply
// on Jobs.cz, the recruiter's e-mail) and whether a nudge is wise at all.
import { recordSpend } from '../ai/budget'
import type { Env } from '../types'

const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'
const QUIET_AFTER_APPLYING_DAYS = 8
const DAYS_AFTER_INTERVIEW = 3
export const DRAFTS_PER_DAY = 3

type Due = { id: string; company: string; role: string; kind: 'applied' | 'interview'; since: string }

/** Cards that deserve a nudge and have not had one of this kind yet, longest silence first. */
export async function findDue(db: D1Database): Promise<Due[]> {
  const now = Date.now()
  const quietSince = new Date(now - QUIET_AFTER_APPLYING_DAYS * 86_400_000).toISOString()
  const interviewedBy = new Date(now - DAYS_AFTER_INTERVIEW * 86_400_000).toISOString().slice(0, 10)
  const { results } = await db
    .prepare(
      `SELECT a.id, a.company, a.role, 'applied' AS kind, coalesce(a.applied_date, a.last_activity_at) AS since
         FROM applications a
        WHERE a.stage = 'applied' AND a.last_activity_at < ?
          AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.application_id = a.id AND f.kind = 'applied')
       UNION ALL
       SELECT a.id, a.company, a.role, 'interview' AS kind, a.interview_at AS since
         FROM applications a
        WHERE a.stage = 'interview' AND a.interview_at IS NOT NULL AND a.interview_at <= ?
          AND a.last_activity_at < a.interview_at || 'T23:59:59'
          AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.application_id = a.id AND f.kind = 'interview')
       ORDER BY since ASC`,
    )
    .bind(quietSince, interviewedBy)
    .all<Due>()
  return results
}

/** "24. srpna" rather than "2026-08-24", which the model copied into the letter verbatim. */
const czDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })

const PROMPT = {
  applied: (d: Due) =>
    `Napiš krátkou, zdvořilou připomínku (3–4 věty) k mé přihlášce na pozici "${d.role}" ve firmě ${d.company}, kterou jsem poslal ${czDate(d.since)} a od té doby jsem nedostal odpověď. Zeptej se, jestli je výběrové řízení stále otevřené a zda potřebují něco dalšího; zopakuj v jedné větě zájem. Bez podbízení a bez výmluv.`,
  interview: (d: Due) =>
    `Napiš krátkou, zdvořilou zprávu (3–4 věty) po pohovoru na pozici "${d.role}" ve firmě ${d.company}, který byl ${czDate(d.since)}. Poděkuj za čas, zopakuj zájem o pozici a zeptej se na další kroky a jejich časový rámec. Bez podbízení.`,
}

async function writeDraft(ai: Ai, due: Due) {
  const out = (await ai.run(MODEL as keyof AiModels, {
    messages: [
      { role: 'system', content: 'Píšeš za Erika Karáska krátké pracovní zprávy v češtině. Vrať jen text zprávy: oslovení "Dobrý den,", tělo a podpis "Erik Karásek". Nic nevymýšlej (jména, data, podrobnosti), co v zadání není. Piš spisovnou češtinou a hlídej shodu ("svou přihlášku", "rád bych").' },
      { role: 'user', content: PROMPT[due.kind](due) },
    ],
    max_tokens: 300,
  } as never)) as { response?: string; choices?: { message?: { content?: string } }[]; usage?: { neurons?: number } }
  const text = (out.response ?? out.choices?.[0]?.message?.content ?? '').trim()
  return { text, neurons: Math.round(out.usage?.neurons ?? 0) }
}

/** Drafts follow-ups for up to DRAFTS_PER_DAY quiet cards; returns how many it wrote. */
export async function draftFollowups(env: Env & { AI: Ai }): Promise<number> {
  const due = (await findDue(env.DB)).slice(0, DRAFTS_PER_DAY)
  let written = 0
  for (const d of due) {
    const { text, neurons } = await writeDraft(env.AI, d)
    await recordSpend(env.DB, 'followup', neurons)
    if (!text) continue
    await env.DB.prepare('INSERT OR IGNORE INTO followups (application_id, kind, draft, created_at) VALUES (?, ?, ?, ?)')
      .bind(d.id, d.kind, text, new Date().toISOString())
      .run()
    written++
  }
  return written
}

export type FollowupRow = { applicationId: string; kind: 'applied' | 'interview'; draft: string; createdAt: string; company: string; role: string; jobUrl: string | null }

export async function listFollowups(db: D1Database): Promise<FollowupRow[]> {
  const { results } = await db
    .prepare(
      `SELECT f.application_id AS applicationId, f.kind, f.draft, f.created_at AS createdAt, a.company, a.role, a.job_url AS jobUrl
         FROM followups f JOIN applications a ON a.id = f.application_id
        WHERE f.status = 'new' ORDER BY f.created_at`,
    )
    .all<FollowupRow>()
  return results
}
