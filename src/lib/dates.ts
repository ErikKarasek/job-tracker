export const STALE_THRESHOLD_DAYS = 14

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function isStale(lastActivityAt: string, stage: string, thresholdDays = STALE_THRESHOLD_DAYS): boolean {
  if (stage === 'offer' || stage === 'rejected') return false
  return daysSince(lastActivityAt) > thresholdDays
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)
  if (min != null && max != null) return `${fmt(min)}–${fmt(max)}`
  return fmt((min ?? max)!)
}
