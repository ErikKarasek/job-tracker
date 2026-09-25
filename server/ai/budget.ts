// A daily budget for Workers AI, kept in D1, so no feature can quietly spend the day for the
// others. On 2026-09-24 a day of testing spent 11 000 neurons and the free allocation stayed
// blocked well into the next day, taking the morning scout down with it; on Workers Paid the
// same day would simply cost a few cents, but an unbounded loop would not stay that cheap.
//
// Every AI call records what it spent; before running, a feature checks two limits: its own
// daily cap, and the total across all features. The portfolio's chat runs in another project
// and is not counted here, which is what the headroom under the total is for.
export type Feature = 'scout' | 'agent' | 'cv' | 'brief'

// 10 000 a day are included in Workers Paid; past them it is $0.011 per 1 000. The total keeps a
// runaway day under ~$0.10 extra; the scout's own cap leaves the interactive features room.
const TOTAL_PER_DAY = 18_000
const CAP: Record<Feature, number> = { scout: 5_000, agent: 6_000, cv: 3_000, brief: 8_000 }

/** Workers AI days turn over at 00:00 UTC. */
const utcDay = () => new Date().toISOString().slice(0, 10)

export async function spentToday(db: D1Database) {
  const { results } = await db.prepare('SELECT feature, neurons FROM ai_spend WHERE day = ?').bind(utcDay()).all<{ feature: Feature; neurons: number }>()
  const byFeature = Object.fromEntries(results.map((r) => [r.feature, r.neurons])) as Partial<Record<Feature, number>>
  const total = results.reduce((n, r) => n + r.neurons, 0)
  return { total, byFeature }
}

/** Null when the feature may run; otherwise the reason it may not, for the user. */
export async function overBudget(db: D1Database, feature: Feature): Promise<string | null> {
  const { total, byFeature } = await spentToday(db)
  if (total >= TOTAL_PER_DAY) return `Today's AI budget (${TOTAL_PER_DAY} neurons) is spent. It resets at 2:00.`
  if ((byFeature[feature] ?? 0) >= CAP[feature]) return `Today's AI budget for this feature (${CAP[feature]} neurons) is spent. It resets at 2:00.`
  return null
}

export async function recordSpend(db: D1Database, feature: Feature, neurons: number) {
  if (!neurons) return
  await db
    .prepare(
      `INSERT INTO ai_spend (day, feature, neurons) VALUES (?, ?, ?)
       ON CONFLICT(day, feature) DO UPDATE SET neurons = neurons + excluded.neurons`,
    )
    .bind(utcDay(), feature, Math.round(neurons))
    .run()
}
