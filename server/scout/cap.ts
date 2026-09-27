// Kept apart from score.ts, with no imports, so the unit tests can load it with plain Node.

// Erik's IT work began with the L1 technician job in April 2026 (the call-centre job before it
// was not IT). Kept as a date so the experience the caps compare against grows by itself.
const IT_WORK_SINCE = Date.parse('2026-04-01')

/**
 * The model's score, capped by what it reported: it tends to be generous (it gave 92 to a role
 * whose required API testing and year of practice Erik lacks), and a cap computed from its own
 * list of gaps is steadier than asking it to be stricter.
 */
export function capScore(fitScore: number, missingMustHaves: number, yearsRequired: number, now = Date.now()) {
  const itYears = (now - IT_WORK_SINCE) / (365 * 86_400_000)
  let cap = 100
  if (missingMustHaves >= 1) cap = Math.min(cap, 78)
  if (missingMustHaves >= 3) cap = Math.min(cap, 60)
  if (yearsRequired > itYears + 0.5) cap = Math.min(cap, 70)
  if (yearsRequired >= 3) cap = Math.min(cap, 50)
  return Math.min(fitScore, cap)
}
