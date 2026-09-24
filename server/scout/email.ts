// The morning digest, sent through Resend from erikkarasek.cz, the domain the portfolio's
// contact form already sends from.
import type { DigestRow, ScoutEnv } from './tick'

const FROM = 'Job Scout <scout@erikkarasek.cz>'
const BOARD = 'https://job-tracker-10s.pages.dev'

export async function sendDigest(env: ScoutEnv, rows: DigestRow[]): Promise<string> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return `${rows.length} new, but no e-mail: RESEND_API_KEY or NOTIFY_EMAIL is not set`

  const scored = rows.filter((r) => r.fit_score != null)
  const best = scored[0]
  const subject = best
    ? `${rows.length} ${plural(rows.length)}, nejlepší shoda ${best.fit_score}: ${best.title}`
    : `${rows.length} ${plural(rows.length)} k prohlédnutí`

  const line = (r: DigestRow) => {
    const where = [r.company, r.location, r.remote ? 'z domova' : null].filter(Boolean).join(' · ')
    const score = r.fit_score != null ? `[${r.fit_score}] ` : '[?] '
    return `${score}${r.title}\n${where}\n${r.fit_summary ?? ''}\n${r.job_url}`
  }
  const text = `Scout dnes našel tyto pozice (seřazené podle shody):\n\n${rows.map(line).join('\n\n')}\n\nPřijmout nebo zahodit je můžeš v Inboxu: ${BOARD}\n`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [env.NOTIFY_EMAIL], subject, text }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[scout] Resend refused the digest', res.status, detail)
    return `e-mail failed: HTTP ${res.status}`
  }
  return `e-mail sent: ${rows.length} postings`
}

/** Any other mail from the scout, e.g. the day-before-interview reminder. */
export async function sendMail(env: ScoutEnv, subject: string, text: string): Promise<string> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return 'no e-mail: RESEND_API_KEY or NOTIFY_EMAIL is not set'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [env.NOTIFY_EMAIL], subject, text }),
  })
  if (!res.ok) {
    console.error('[scout] Resend refused', res.status, await res.text().catch(() => ''))
    return `e-mail failed: HTTP ${res.status}`
  }
  return 'e-mail sent'
}

const plural = (n: number) => (n === 1 ? 'nová pozice' : n >= 2 && n <= 4 ? 'nové pozice' : 'nových pozic')
