import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api-client'
import { formatSalary } from '../lib/dates'
import type { Suggestion } from '../types'
import { Followups } from './Followups'

// The server's order is the recommended one: AI and development roles lifted over support (see
// /api/suggestions). The others are plain sorts; postings without a value always go last.
const SORTS = {
  recommended: 'Recommended',
  score: 'Fit score',
  newest: 'Newest',
  salary: 'Salary',
  place: 'Place',
} as const
type Sort = keyof typeof SORTS
const SORT_KEY = 'inbox-sort'

// The two towns Erik can reach without a car, the same ones the scout keeps
// (server/scout/commute.ts). A posting can be in more than one place — remote work advertised in
// Hradec Králové — so it carries every place that fits, and 'other' only when none do.
const PLACES = {
  hradec: 'Hradec Králové',
  pardubice: 'Pardubice',
  remote: 'Remote',
  other: 'Somewhere else',
} as const
type Place = keyof typeof PLACES
const PLACES_KEY = 'inbox-places'
// Listed nearest first, which is also the order the place sort groups by.
const PLACE_ORDER = Object.keys(PLACES) as Place[]

function placesOf(s: Suggestion): Place[] {
  const where = s.location ?? ''
  const found: Place[] = []
  if (/Hradec Králové/i.test(where)) found.push('hradec')
  if (/\bPardubice\b/i.test(where)) found.push('pardubice')
  if (s.remote) found.push('remote')
  return found.length > 0 ? found : ['other']
}

function sorted(items: Suggestion[], sort: Sort): Suggestion[] {
  if (sort === 'recommended') return items
  if (sort === 'place') {
    // A posting sorts by its nearest place; sort is stable, so within one place the recommended
    // order survives — this groups the list rather than reshuffling it.
    const rank = (s: Suggestion) => Math.min(...placesOf(s).map((p) => PLACE_ORDER.indexOf(p)))
    return [...items].sort((a, b) => rank(a) - rank(b))
  }
  const value = (s: Suggestion) =>
    sort === 'score' ? s.fitScore : sort === 'salary' ? (s.salaryMax ?? s.salaryMin) : Date.parse(s.foundAt)
  return [...items].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1
    return vb - va
  })
}

function savedSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return v && v in SORTS ? (v as Sort) : 'recommended'
  } catch {
    return 'recommended'
  }
}

/** Nothing ticked means no filter, which is where a fresh browser starts. */
function savedPlaces(): Place[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PLACES_KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter((p): p is Place => typeof p === 'string' && p in PLACES) : []
  } catch {
    return []
  }
}

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
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [spend, setSpend] = useState<{ total: number; byFeature: Record<string, number> } | null>(null)
  const [sort, setSort] = useState<Sort>(savedSort)
  const [places, setPlaces] = useState<Place[]>(savedPlaces)

  function changeSort(next: Sort) {
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // Private window: the choice just isn't remembered.
    }
  }

  function pickPlaces(next: Place[]) {
    setPlaces(next)
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(next))
    } catch {
      // Private window: the choice just isn't remembered.
    }
  }

  function togglePlace(place: Place) {
    pickPlaces(places.includes(place) ? places.filter((p) => p !== place) : [...places, place])
  }

  const load = useCallback(async () => {
    try {
      const [data, spent] = await Promise.all([api.suggestions(), api.aiSpend().catch(() => null)])
      setSpend(spent)
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
  // for today. Each step is short, so a slow agent run never holds one request for long. The
  // last message stays on screen: it is the only place a stop (e.g. the AI allocation running
  // out) is explained.
  async function searchNow() {
    setError(null)
    let last = ''
    let failure: string | null = null
    for (let i = 0; i < 60; i++) {
      try {
        const r = await api.scoutTick()
        last = `${r.step}: ${r.detail}`
        setRunning(last)
        if (r.step === 'score') await load()
        if (r.step === 'idle' || r.step === 'digest' || r.detail.includes('used up')) break
      } catch (err) {
        failure = `The scout stopped: ${err instanceof Error ? err.message : String(err)}`
        break
      }
    }
    setRunning(null)
    setLastRun(last || null)
    await load()
    // After load(), which clears errors from earlier requests.
    if (failure) setError(failure)
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

  const visible = places.length === 0 ? items : items.filter((s) => placesOf(s).some((p) => places.includes(p)))

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl text-ink">Inbox</h1>
          <p className="text-sm text-mute">
            {loading
              ? 'Loading…'
              : `${places.length > 0 ? `${visible.length} of ${items.length}` : items.length} to review${
                  queued ? `, ${queued} waiting to be scored` : ''
                }. The scout searches Jobs.cz every morning.`}
          </p>
          {spend && (
            <p className="font-mono text-xs text-mute" title="Workers AI neurons spent today (UTC day); 10 000 a day are included in the plan">
              AI today: {spend.total.toLocaleString('cs-CZ')} neurons
              {Object.keys(spend.byFeature).length > 0 &&
                ` (${Object.entries(spend.byFeature)
                  .map(([f, n]) => `${f} ${n.toLocaleString('cs-CZ')}`)
                  .join(', ')})`}
            </p>
          )}
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

      {(running ?? lastRun) && (
        <p className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-mute">{running ?? `Last step: ${lastRun}`}</p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
          {error}
        </p>
      )}

      <Followups />

      {(places.length > 0 || items.length > 1) && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Filter postings by place">
          <span className="mr-1 text-mute">Place</span>
          {PLACE_ORDER.map((key) => {
            const count = items.filter((s) => placesOf(s).includes(key)).length
            const on = places.includes(key)
            return (
              <button
                key={key}
                type="button"
                onClick={() => togglePlace(key)}
                aria-pressed={on}
                className={`rounded-md border px-2.5 py-1 ${on ? 'border-signal/60 bg-signal/10 text-signal' : 'border-line text-ink-2 hover:text-ink'}`}
              >
                {on ? '✓ ' : ''}
                {PLACES[key]} <span className="font-mono text-xs text-mute">{count}</span>
              </button>
            )
          })}
          {places.length > 0 && (
            <button type="button" onClick={() => pickPlaces([])} className="px-1.5 py-1 text-mute underline hover:text-ink">
              Clear
            </button>
          )}
        </div>
      )}

      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" role="group" aria-label="Sort postings">
          <span className="mr-1 text-mute">Sort by</span>
          {(Object.keys(SORTS) as Sort[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => changeSort(key)}
              aria-pressed={sort === key}
              className={`rounded-md border px-2.5 py-1 ${sort === key ? 'border-signal/60 bg-signal/10 text-signal' : 'border-line text-ink-2 hover:text-ink'}`}
            >
              {SORTS[key]}
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {sorted(visible, sort).map((s) => (
          <SuggestionCard key={s.id} s={s} onDecide={decide} />
        ))}
      </ul>
      {!loading && visible.length === 0 && (
        <p className="text-sm text-mute">
          {items.length > 0
            ? 'Nothing in the places you ticked. Untick one to see the rest.'
            : 'Nothing to review. New postings arrive each morning.'}
        </p>
      )}
    </div>
  )
}

function SuggestionCard({ s, onDecide }: { s: Suggestion; onDecide: (id: string, action: 'accept' | 'dismiss') => void }) {
  const [copied, setCopied] = useState(false)
  // The scout only scores; a letter is written with the better model when asked for here.
  const [letter, setLetter] = useState(s.coverLetter)
  const [writing, setWriting] = useState<string | null>(null)
  async function writeLetter() {
    setWriting('Writing… (10–20 s)')
    try {
      setLetter((await api.writeLetter(s.id)).coverLetter)
      setWriting(null)
    } catch (err) {
      setWriting(err instanceof Error ? err.message : String(err))
    }
  }
  const salary = formatSalary(s.salaryMin, s.salaryMax)
  const tone =
    s.fitScore == null ? 'text-mute' : s.fitScore >= 75 ? 'text-stage-offer' : s.fitScore >= 50 ? 'text-stage-interview' : 'text-stage-rejected'

  return (
    <li className="flex gap-4 rounded-lg border border-line bg-surface-2 p-4">
      {s.fitScore != null ? (
        <p className={`w-12 shrink-0 font-mono text-2xl font-semibold ${tone}`}>{s.fitScore}</p>
      ) : (
        // No score: the scout could not read the posting (the reason is in fitSummary below).
        <p className="w-12 shrink-0 pt-1 font-mono text-xs leading-tight text-mute" title="Not scored: the posting could not be read automatically">
          not
          <br />
          scored
        </p>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <a href={s.jobUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:text-signal">
            {s.title}
          </a>
          <p className="text-sm text-ink-2">{s.company}</p>
          <p className="font-mono text-xs text-mute">
            {[s.location, s.remote ? 'remote' : null, salary, s.query].filter(Boolean).join(' · ')}
          </p>
        </div>
        {s.fitSummary && <p className="text-sm text-ink-2">{s.fitSummary}</p>}
        {letter && (
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-mute">Cover letter draft (check it before sending)</summary>
            <p className="mt-2 whitespace-pre-line rounded-md border border-line-soft bg-bg p-3 text-ink-2">{letter}</p>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(letter ?? '').then(() => setCopied(true))}
              className="mt-2 rounded-md border border-line px-2 py-0.5 text-xs text-mute hover:text-ink"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </details>
        )}
        {writing && <p className="text-xs text-mute">{writing}</p>}
        <div className="flex gap-2">
          {!letter && s.fitScore != null && (
            <button
              type="button"
              onClick={() => void writeLetter()}
              disabled={writing?.startsWith('Writing') ?? false}
              className="rounded-md border border-signal/60 px-3 py-1.5 text-sm text-signal hover:bg-signal/10 disabled:opacity-50"
            >
              Write cover letter
            </button>
          )}
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
