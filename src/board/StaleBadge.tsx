import { daysSince, isStale } from '../lib/dates'
import type { Stage } from '../types'

export function StaleBadge({ lastActivityAt, stage }: { lastActivityAt: string; stage: Stage }) {
  if (!isStale(lastActivityAt, stage)) return null
  const days = daysSince(lastActivityAt)
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[11px] text-signal">
      no activity {days}d
    </span>
  )
}
