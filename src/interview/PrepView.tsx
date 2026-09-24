import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type BriefResponse } from '../lib/api-client'
import type { Application } from '../types'

// Printing shows only this view: it is portalled next to the app's root, which print hides.
const PRINT_CSS = `@media print {
  #root { display: none !important }
  html, body { background: #fff !important }
  .prep-overlay { position: static !important; overflow: visible !important; background: #fff !important; color: #111 !important }
  .prep-overlay * { color: #111 !important; border-color: #ccc !important; background: none !important }
}`

/**
 * The interview brief the agent wrote (server/interview/): the company, likely questions with
 * answers built on Erik's own experience, what to revise, what to ask. It is started on its own
 * when a card reaches Interview; this view shows it, polls while it is being written, and holds
 * the interview date the day-before e-mail keys off.
 */
export function PrepView({
  application,
  onClose,
  onDate,
}: {
  application: Application
  onClose: () => void
  onDate: (date: string | null) => void
}) {
  const [data, setData] = useState<BriefResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [date, setDate] = useState(application.interviewAt ?? '')

  const load = useCallback(async () => {
    try {
      setData(await api.getBrief(application.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [application.id])

  useEffect(() => {
    void load()
  }, [load])

  // While the agent writes in the background, check back every few seconds.
  useEffect(() => {
    if (data?.status !== 'writing') return
    const id = setInterval(() => void load(), 4000)
    return () => clearInterval(id)
  }, [data?.status, load])

  async function write(pasted?: string) {
    setError(null)
    try {
      await api.writeBrief(application.id, pasted)
      setData({ status: 'writing', brief: null, error: null, createdAt: new Date().toISOString() })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const b = data?.brief
  const section = 'flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-4'
  const h = 'text-xs font-semibold uppercase tracking-wide text-signal'

  return createPortal(
    <div className="prep-overlay fixed inset-0 z-50 overflow-y-auto bg-bg text-ink">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
            ← Back
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
            Interview on
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                onDate(e.target.value || null)
              }}
              className="rounded-md border border-line bg-surface-2 px-2 py-1 text-ink"
            />
          </label>
          {data?.status === 'ready' && (
            <>
              <button type="button" onClick={() => void write()} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
                Write again
              </button>
              <button type="button" onClick={() => window.print()} className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink">
                Print
              </button>
            </>
          )}
        </div>

        <div>
          <h1 className="font-semibold text-xl">Interview prep: {application.role}</h1>
          <p className="text-sm text-mute">
            {application.company}
            {date && ` · ${new Date(`${date}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}`}
            {date && ' · the brief comes by e-mail the morning before'}
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
            {error}
          </p>
        )}

        {data === null && !error && <p className="text-sm text-mute">Loading…</p>}

        {data?.status === null && (
          <div className={section}>
            <p className="text-sm text-ink-2">No brief yet. The agent reads the posting and the company's website, then writes likely questions with answers built on your experience.</p>
            <button type="button" onClick={() => void write()} className="self-start rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink">
              Write the brief
            </button>
          </div>
        )}

        {data?.status === 'writing' && (
          <p className="animate-pulse rounded-md border border-line bg-surface-2 px-3 py-6 text-center text-sm text-mute">
            The agent is reading the posting and the company's site and writing the brief… (usually under a minute)
          </p>
        )}

        {data?.status === 'failed' && (
          <div className={section}>
            <p className="text-sm text-stage-rejected">{data.error}</p>
            <p className="text-sm text-ink-2">If the posting page cannot be read, paste its text and try again.</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" />
            <button type="button" onClick={() => void write(text.trim() || undefined)} className="self-start rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink">
              Try again
            </button>
          </div>
        )}

        {data?.status === 'ready' && b && (
          <>
            <p className="text-xs text-mute print:hidden">Written by a model from the pages below. Check anything you plan to say out loud.</p>
            <div className={section}>
              <h2 className={h}>Firma</h2>
              <p className="text-sm text-ink-2">{b.company}</p>
              <h2 className={h}>Role</h2>
              <p className="text-sm text-ink-2">{b.role}</p>
            </div>
            <div className={section}>
              <h2 className={h}>Pravděpodobné otázky</h2>
              <ol className="flex flex-col gap-3">
                {b.questions.map((q, i) => (
                  <li key={i}>
                    <p className="font-medium text-ink">
                      {i + 1}. {q.question}
                    </p>
                    <p className="mt-1 text-sm text-ink-2">→ {q.answer}</p>
                  </li>
                ))}
              </ol>
            </div>
            {b.gaps.length > 0 && (
              <div className={section}>
                <h2 className={h}>Na co se připravit</h2>
                <ul className="flex flex-col gap-2 text-sm">
                  {b.gaps.map((g, i) => (
                    <li key={i}>
                      <b className="text-ink">{g.gap}</b> <span className="text-ink-2">{g.handle}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {b.topics.length > 0 && (
                <div className={section}>
                  <h2 className={h}>Zopakovat si</h2>
                  <ul className="list-disc pl-5 text-sm text-ink-2">
                    {b.topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {b.ask.length > 0 && (
                <div className={section}>
                  <h2 className={h}>Zeptej se jich</h2>
                  <ul className="list-disc pl-5 text-sm text-ink-2">
                    {b.ask.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-xs text-mute">
              Sources:{' '}
              {b.sources.map((s, i) => (
                <span key={s}>
                  {i > 0 && ' · '}
                  <a href={s} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                    {new URL(s).hostname}
                  </a>
                </span>
              ))}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
