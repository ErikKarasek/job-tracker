import { useEffect, useState } from 'react'
import type { Application, StatsSummary, TimelinePoint } from '../types'
import { api } from '../lib/api-client'
import { StatTile } from './StatTile'
import { FunnelChart } from './FunnelChart'
import { TimelineChart } from './TimelineChart'
import { daysSince } from '../lib/dates'

export function StatsDashboard() {
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [stale, setStale] = useState<Application[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.statsSummary(), api.statsTimeline(), api.statsStale()])
      .then(([s, t, st]) => {
        setSummary(s)
        setTimeline(t)
        setStale(st)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load stats'))
  }, [])

  if (error) return <p role="alert" className="p-4 text-sm text-stage-rejected">{error}</p>
  if (!summary) return <p className="p-4 text-sm text-mute">Loading…</p>

  const funnelSteps = [
    { label: 'Applied', count: summary.stagesReached.applied },
    { label: 'Interview', count: summary.stagesReached.interview },
    { label: 'Offer', count: summary.stagesReached.offer },
  ]

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <h1 className="font-semibold text-xl text-ink">Stats</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total applications" value={summary.totalCount} />
        <StatTile label="Applied → interview" value={summary.funnel.appliedToInterviewPct != null ? `${summary.funnel.appliedToInterviewPct}%` : '—'} />
        <StatTile label="Interview → offer" value={summary.funnel.interviewToOfferPct != null ? `${summary.funnel.interviewToOfferPct}%` : '—'} />
        <StatTile label="Needs follow-up" value={stale.length} />
      </div>

      <section className="rounded-lg border border-line-soft bg-surface p-4">
        <FunnelChart steps={funnelSteps} />
      </section>

      {timeline.length > 0 && (
        <section className="rounded-lg border border-line-soft bg-surface p-4 overflow-x-auto">
          <TimelineChart points={timeline} />
        </section>
      )}

      {stale.length > 0 && (
        <section className="rounded-lg border border-signal/30 bg-signal/5 p-4">
          <h2 className="font-semibold text-ink">Needs follow-up</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {stale.map((app) => (
              <li key={app.id} className="flex justify-between text-sm text-ink-2">
                <span>{app.role} · {app.company}</span>
                <span className="font-mono text-xs text-signal">{daysSince(app.lastActivityAt)}d quiet</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
