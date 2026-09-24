import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api-client'
import { formatSalary } from '../lib/dates'
import type { Suggestion } from '../types'

/**
 * What the scout found (server/scout/): postings from Jobs.cz, scored by the agent, best fit
 * first. Accept turns one into a Wishlist card; dismiss drops it. Nothing reaches the board
 * without one of these two clicks.
 */
export function Inbox() {
  const [items, setItems] = useState<Suggestion[]>([])
  const [queued, setQueued] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.suggestions()
      setItems(data.suggestions)
      setQueued(data.queued)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Runs the same steps the morning cron does, one request each, until the scout says it is done
  // for today. Each step is short, so a slow agent run never holds one request for long.
  async function searchNow() {
    for (let i = 0; i < 40; i++) {
      const r = await api.scoutTick().catch((err: Error) => ({ step: 'idle' as const, detail: err.message }))
      setRunning(`${r.step}: ${r.detail}`)
      if (r.step === 'score') await load()
      if (r.step === 'idle' || r.step === 'digest') break
    }
    setRunning(null)
    await load()
  }

  async function decide(id: string, action: 'accept' | 'dismiss') {
    setItems((list) => list.filter((s) => s.id !== id))
    try {
      if (action === 'accept') await api.acceptSuggestion(id)
      else await api.dismissSuggestion(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      await load()
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl text-ink">Inbox</h1>
          <p className="text-sm text-mute">
            {loading ? 'Loading…' : `${items.length} to review${queued ? `, ${queued} waiting to be scored` : ''}. The scout searches Jobs.cz every morning.`}
          </p>
        </div>
        <button
          type="button"
          onClick={searchNow}
          disabled={running !== null}
          className="rounded-md border border-signal/60 px-3 py-2 text-sm font-medium text-signal hover:bg-signal/10 disabled:opacity-50"
        >
          {running ? 'Searching…' : 'Search now'}
        </button>
      </header>

      {running && <p className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-mute">{running}</p>}
      {error && (
        <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((s) => (
          <SuggestionCard key={s.id} s={s} onDecide={decide} />
        ))}
      </ul>
      {!loading && items.length === 0 && <p className="text-sm text-mute">Nothing to review. New postings arrive each morning.</p>}
    </div>
  )
}

function SuggestionCard({ s, onDecide }: { s: Suggestion; onDecide: (id: string, action: 'accept' | 'dismiss') => void }) {
  const [copied, setCopied] = useState(false)
  const salary = formatSalary(s.salaryMin, s.salaryMax)
  const tone =
    s.fitScore == null ? 'text-mute' : s.fitScore >= 75 ? 'text-stage-offer' : s.fitScore >= 50 ? 'text-stage-interview' : 'text-stage-rejected'

  return (
    <li className="flex gap-4 rounded-lg border border-line bg-surface-2 p-4">
      <p className={`w-12 shrink-0 font-mono text-2xl font-semibold ${tone}`}>{s.fitScore ?? '?'}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <a href={s.jobUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-signal">
            {s.title}
          </a>
          <p className="text-sm text-ink-2">{s.company}</p>
          <p className="font-mono text-xs text-mute">
            {[s.location, s.remote ? 'remote' : null, salary, `“${s.query}”`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {s.fitSummary && <p className="text-sm text-ink-2">{s.fitSummary}</p>}
        {s.coverLetter && (
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-mute">Cover letter draft (check it before sending)</summary>
            <p className="mt-2 whitespace-pre-line rounded-md border border-line-soft bg-bg p-3 text-ink-2">{s.coverLetter}</p>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(s.coverLetter ?? '').then(() => setCopied(true))}
              className="mt-2 rounded-md border border-line px-2 py-0.5 text-xs text-mute hover:text-ink"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </details>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onDecide(s.id, 'accept')}
            className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink hover:brightness-110"
          >
            Add to Wishlist
          </button>
          <button
            type="button"
            onClick={() => onDecide(s.id, 'dismiss')}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    </li>
  )
}
