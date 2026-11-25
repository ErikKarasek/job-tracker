// Kept apart from score.ts, with no imports, so the unit tests can load it with plain Node.

// Erik's IT work began with the L1 technician job in April 2026 (the call-centre job before it
// was not IT). Kept as a date so the experience the caps compare against grows by itself.
const IT_WORK_SINCE = Date.parse('2026-04-01')

/** The seniority a posting is written for, as the model reads it. */
export type Level = 'junior' | 'medior' | 'senior' | 'unspecified'

export type Gaps = {
  /** Required qualifications the model found no evidence for. */
  missing: string[]
  /** Years of experience the posting asks for, 0 for none. */
  years: number
  level?: Level
}

// Erik finished secondary school with a maturita; a posting that requires a university degree
// filters him out at the HR stage, however well the rest fits.
// \b only knows ASCII letters, so "VŠ" needs letter lookarounds with the u flag (as in search.ts).
const DEGREE = /(univerzit|university|vysokoškol|(?<!\p{L})VŠ(?!\p{L})|(?<!\p{L})degree|bachelor|master'?s|(?<!\p{L})(Bc|Ing|Mgr)\.)/iu

/**
 * The model's score, capped by what it reported: it tends to be generous (it gave 92 to a role
 * whose required API testing and year of practice Erik lacks), and a cap computed from its own
 * list of gaps is steadier than asking it to be stricter.
 *
 * Tightened on 2026-11-25 after a run of rejections: NTT asked for 2–4 years and scored 70,
 * Comgate wanted a senior with a degree and scored 65, Kingspan's "Lead" role got applied to.
 * Experience, a degree and the posting's own seniority are what a junior is turned away on, so
 * each of them now caps the score on its own, and the reason is returned so the card can say why.
 */
export function capFit(score: number, gaps: Gaps, now = Date.now()): { score: number; reason: string | null } {
  const itYears = Math.max(0, (now - IT_WORK_SINCE) / (365 * 86_400_000))
  const shortfall = gaps.years - itYears
  const caps: [number, string][] = []
  if (gaps.missing.length >= 1) caps.push([78, `misses ${gaps.missing.length === 1 ? 'a requirement' : 'requirements'}: ${gaps.missing.slice(0, 2).join(', ')}`])
  if (gaps.missing.length >= 3) caps.push([60, `misses ${gaps.missing.length} requirements`])
  if (gaps.missing.some((m) => DEGREE.test(m))) caps.push([45, 'requires a university degree'])
  if (shortfall > 0.5) caps.push([55, `asks for ${gaps.years} years of experience`])
  if (shortfall > 1.5) caps.push([45, `asks for ${gaps.years} years of experience`])
  if (gaps.years >= 3) caps.push([35, `asks for ${gaps.years} years of experience`])
  if (gaps.level === 'medior') caps.push([60, 'written for a mid-level candidate'])
  if (gaps.level === 'senior') caps.push([35, 'written for a senior candidate'])
  const tightest = caps.reduce<[number, string] | null>((best, c) => (best === null || c[0] < best[0] ? c : best), null)
  if (!tightest || score <= tightest[0]) return { score, reason: null }
  return { score: tightest[0], reason: tightest[1] }
}

/** The capped score alone, from a count of missing requirements (the older call). */
export function capScore(fitScore: number, missingMustHaves: number, yearsRequired: number, now = Date.now()) {
  return capFit(fitScore, { missing: Array.from({ length: missingMustHaves }, () => 'requirement'), years: yearsRequired }, now).score
}
