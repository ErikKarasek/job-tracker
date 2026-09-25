import { useEffect, useState } from 'react'
import { api, type Followup } from '../lib/api-client'

/**
 * Nudges for applications gone quiet, drafted by the scout each morning (server/followup/).
 * Erik sends them himself; "Sent" records that, which also resets the card's quiet-days badge.
 */
export function Followups() {
  const [items, setItems] = useState<Followup[]>([])
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    void api.followups().then(setItems, () => setItems([]))
  }, [])

  async function decide(f: Followup, action: 'sent' | 'dismissed') {
    setItems((list) => list.filter((x) => !(x.applicationId === f.applicationId && x.kind === f.kind)))
    await api.decideFollowup(f.applicationId, f.kind, action).catch(() => undefined)
  }

  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold text-ink">Follow up</h2>
      {items.map((f) => {
        const key = `${f.applicationId}:${f.kind}`
        return (
          <div key={key} className="flex flex-col gap-2 rounded-lg border border-stage-interview/40 bg-surface-2 p-4">
            <p className="text-sm text-ink">
              <b>{f.role}</b>, {f.company}{' '}
              <span className="text-mute">{f.kind === 'interview' ? '· after the interview' : '· no reply since applying'}</span>
            </p>
            <p className="whitespace-pre-line rounded-md border border-line-soft bg-bg p-3 text-sm text-ink-2">{f.draft}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(f.draft).then(() => setCopied(key))}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
              >
                {copied === key ? 'Copied' : 'Copy'}
              </button>
              {f.jobUrl && (
                <a href={f.jobUrl} target="_blank" rel="noreferrer" className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
                  Posting
                </a>
              )}
              <button type="button" onClick={() => void decide(f, 'sent')} className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink">
                Sent
              </button>
              <button type="button" onClick={() => void decide(f, 'dismissed')} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
