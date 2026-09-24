import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api-client'
import type { AgentResult, ApplicationInput, Draft, TraceStep } from '../types'

interface AgentModalProps {
  open: boolean
  onClose: () => void
  onSave: (input: ApplicationInput) => void
}

type Phase = { kind: 'input' } | { kind: 'running' } | { kind: 'done'; result: AgentResult } | { kind: 'error'; message: string }

const inputCls =
  'rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal'

/**
 * Paste a posting link (or its text), let the agent read it, check for duplicates and score the
 * fit, then review its draft before anything reaches the board. The agent never saves on its own.
 */
export function AgentModal({ open, onClose, onSave }: AgentModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'input' })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function reset() {
    setUrl('')
    setText('')
    setPhase({ kind: 'input' })
  }

  function close() {
    reset()
    onClose()
  }

  async function run() {
    setPhase({ kind: 'running' })
    try {
      const result = await api.draftFromPosting({ url: url.trim() || undefined, text: text.trim() || undefined })
      setPhase({ kind: 'done', result })
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (!open) return null
  const result = phase.kind === 'done' ? phase.result : null

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onCancel={close}
      aria-labelledby="agent-title"
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 id="agent-title" className="font-semibold text-lg">
            Add from a job posting
          </h2>
          <p className="text-sm text-mute">
            The agent reads the posting, checks the board for duplicates and scores the fit. You review the draft before it is saved.
          </p>
        </div>

        {(phase.kind === 'input' || phase.kind === 'error' || result?.status === 'needs_input' || result?.status === 'failed') && (
          <div className="flex flex-col gap-3">
            {result && result.status !== 'draft' && (
              <p className="rounded-md border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-ink">{result.message}</p>
            )}
            {phase.kind === 'error' && (
              <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
                {phase.message}
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              Posting URL
              <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://www.jobs.cz/rpd/…" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-2">
              …or paste the posting text (LinkedIn, StartupJobs and most career sites cannot be read from a link)
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className={inputCls} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={!url.trim() && !text.trim()}
                className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink hover:brightness-110 disabled:opacity-40"
              >
                Run agent
              </button>
            </div>
          </div>
        )}

        {phase.kind === 'running' && (
          <p className="animate-pulse rounded-md border border-line bg-surface-2 px-3 py-6 text-center text-sm text-mute">
            Reading the posting, checking the board, scoring the fit… (10–30 s)
          </p>
        )}

        {result?.status === 'draft' && (
          <DraftReview
            draft={result.draft}
            jobUrl={url.trim() || null}
            onBack={reset}
            onSave={(input) => {
              onSave(input)
              close()
            }}
          />
        )}

        {result && <Trace steps={result.trace} />}
      </div>
    </dialog>
  )
}

function DraftReview({
  draft,
  jobUrl,
  onBack,
  onSave,
}: {
  draft: Draft
  jobUrl: string | null
  onBack: () => void
  onSave: (input: ApplicationInput) => void
}) {
  const [copied, setCopied] = useState(false)
  const tone = draft.fitScore >= 75 ? 'text-stage-offer' : draft.fitScore >= 50 ? 'text-stage-interview' : 'text-stage-rejected'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const str = (key: string) => {
      const v = String(form.get(key) ?? '').trim()
      return v || null
    }
    const num = (key: string) => {
      const v = str(key)
      return v ? Number(v) : null
    }
    onSave({
      company: str('company') ?? draft.company,
      role: str('role') ?? draft.role,
      jobUrl,
      location: str('location'),
      salaryMin: num('salaryMin'),
      salaryMax: num('salaryMax'),
      source: str('source'),
      fitScore: draft.fitScore,
      fitSummary: draft.fitSummary,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {draft.duplicateOf && (
        <p className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
          This role is already on the board. Saving adds a second card.
        </p>
      )}

      <div className="flex items-start gap-3 rounded-md border border-line bg-surface-2 p-3">
        <p className={`font-mono text-3xl font-semibold ${tone}`}>{draft.fitScore}</p>
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">Fit</p>
          <p className="text-sm text-ink-2">{draft.fitSummary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Company" name="company" value={draft.company} />
        <Field label="Role" name="role" value={draft.role} />
        <Field label="Location" name="location" value={draft.location} />
        <Field label="Source" name="source" value={draft.source} />
        <Field label="Salary min" name="salaryMin" value={draft.salaryMin} type="number" />
        <Field label="Salary max" name="salaryMax" value={draft.salaryMax} type="number" />
      </div>

      <label className="flex flex-col gap-1 text-sm text-ink-2">
        <span className="flex items-center justify-between">
          Cover letter draft. Check every claim before you send it: the model can get facts wrong.
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(draft.coverLetter).then(() => setCopied(true))
            }}
            className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-mute hover:text-ink"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
        <textarea readOnly value={draft.coverLetter} rows={8} className={`${inputCls} text-sm`} />
        <span className="text-xs text-mute">Not saved with the card: the board is public.</span>
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
          Start over
        </button>
        <button type="submit" className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink hover:brightness-110">
          Save to Wishlist
        </button>
      </div>
    </form>
  )
}

function Field({ label, name, value, type = 'text' }: { label: string; name: string; value: string | number | null; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
      {label}
      <input name={name} type={type} defaultValue={value ?? ''} className={inputCls} />
    </label>
  )
}

/** What the agent did, step by step: which tools it called, with what, and what came back. */
function Trace({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return null
  return (
    <details className="rounded-md border border-line-soft bg-bg px-3 py-2 text-xs text-mute">
      <summary className="cursor-pointer select-none">Agent steps ({steps.length})</summary>
      <ol className="mt-2 flex flex-col gap-2 font-mono">
        {steps.map((s, i) => (
          <li key={i} className="break-words">
            {s.kind === 'tool' ? (
              <>
                <span className="text-signal">{s.name}</span>({JSON.stringify(s.arguments).slice(0, 120)}) → {s.result}
              </>
            ) : (
              <>
                <span className="text-ink-2">model said:</span> {s.text.slice(0, 200)}
              </>
            )}
          </li>
        ))}
      </ol>
    </details>
  )
}
