// How the scout scores a posting: one call to a small model for the fit, and plain code for
// everything that can be read off the page.
//
// Measured side by side on the same four postings: Llama 3.1 8B cost 20 neurons a posting where
// the Mistral agent cost ~420, and ranked them in the same order (85/75/60/20 against
// 90/85/60/30). It also invented a salary for three postings that state none, so the salary is
// read by code from Jobs.cz's own "Plat … Kč" line, and company and location come from the
// search card. The model only judges fit, which is the one thing code cannot. Cover letters,
// which need the better model, are written when Erik opens a suggestion, not for every posting.
import { PROFILE } from '../agent/profile'
import { chat, type Llm } from '../ai/chat'
import { capFit, capScore, type Level } from './cap'

export { capScore }

// Two tiers. The small model ranks everything for ~20 neurons; it is generous and its list of
// gaps is noise (it called Erik's AI tools and Git missing). Postings it rates PRECISE_FROM or
// more are scored again by Mistral (~150 neurons), whose gaps held up on the same postings (it
// named C/C++, .NET and SQL Server where they were required). The number Erik sees at the top of
// the inbox is Mistral's; further down, the ranking is all that matters.
// Since moving to Gemini (server/ai/chat.ts) the tiers are Flash-Lite and Flash, and these two are
// the fallback.
export const PRECISE_FROM = 65

const SCHEMA = {
  type: 'object',
  properties: {
    fitScore: { type: 'integer' },
    fitSummary: { type: 'string' },
    missingMustHaves: { type: 'array', items: { type: 'string' } },
    yearsRequired: { type: 'number' },
    level: { type: 'string', enum: ['junior', 'medior', 'senior', 'unspecified'] },
  },
  required: ['fitScore', 'fitSummary', 'missingMustHaves', 'yearsRequired', 'level'],
}

const SYSTEM = `You judge how well a job posting fits Erik. Answer with JSON only:
- missingMustHaves: at most 5 REQUIRED qualifications Erik has no evidence for: a tool, technology, certificate, education or amount of experience (e.g. "API testing in Postman", "C#", "university degree"). Not duties or tasks of the job ("verify features", "cooperate with colleagues") — only what a candidate must already have. Nothing the posting calls an advantage, a plus, "výhodou", "ideálně" or "not required". Empty list if he meets everything required.
- yearsRequired: years of experience the posting asks for (use the number even if it says "ideally"; for a range like "2-4 years" the lower end), 0 if it asks for none.
- level: who the posting is written for. "junior" when it names juniors, graduates or absolventi, or says experience is not needed; "senior" for senior, lead, expert or "zkušený" roles and for 3+ years; "medior" for mid-level or 1-3 years; otherwise "unspecified".
- A required university degree (VŠ, Bc., Ing., bachelor's) counts as a missing must-have: Erik has a secondary-school maturita.
- fitScore: 0-100, honest. 80+ only when he meets nearly every hard requirement.
- fitSummary: two sentences in English. First: which of the posting's requirements Erik meets best, naming his concrete experience. Second: the most important requirement he lacks. Never describe what the posting fails to mention.

Erik's profile:
${PROFILE}`

export type FitScore = { fitScore: number; fitSummary: string; neurons: number; modelScore: number; missingMustHaves: string[]; yearsRequired: number; level: Level }

export async function scoreFit(env: Llm, posting: string, precise = false): Promise<FitScore> {
  const out = await chat(env, precise ? 'smart' : 'cheap')({
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Job posting:\n\n${posting.slice(0, 8_000)}` },
    ],
    max_tokens: 400,
    schema: SCHEMA,
  })

  const data = JSON.parse(out.content ?? 'null') as {
    fitScore?: unknown
    fitSummary?: unknown
    missingMustHaves?: unknown
    yearsRequired?: unknown
    level?: unknown
  }
  const modelScore = typeof data?.fitScore === 'number' ? Math.min(100, Math.max(0, Math.round(data.fitScore))) : null
  const fitSummary = typeof data?.fitSummary === 'string' ? data.fitSummary.trim() : ''
  if (modelScore === null || !fitSummary) throw new Error('The model returned no usable score.')
  // The small model lists "an advantage" items as required despite being told not to; they are
  // dropped here by their own wording.
  const optional = /(výhod|ideáln|není podmínk|advantage|a plus|preferred|nice to have|optional)/i
  const missingMustHaves = (Array.isArray(data.missingMustHaves) ? data.missingMustHaves : [])
    .filter((m): m is string => typeof m === 'string' && m.trim() !== '' && !optional.test(m))
    .slice(0, 5)
  const years = typeof data.yearsRequired === 'number' && Number.isFinite(data.yearsRequired) ? data.yearsRequired : 0
  const level: Level = ['junior', 'medior', 'senior'].includes(data.level as string) ? (data.level as Level) : 'unspecified'
  const capped = capFit(modelScore, { missing: missingMustHaves, years, level })
  // A capped score says why on the card, or a 45 next to a glowing summary reads as a bug.
  const summary = capped.reason ? `${fitSummary} Score capped at ${capped.score}: ${capped.reason}.` : fitSummary
  return { fitScore: capped.score, fitSummary: summary, neurons: out.neurons, modelScore, missingMustHaves, yearsRequired: years, level }
}

/** Jobs.cz states pay as "Plat 30 000 – 40 000 Kč" (or CZK, or a single figure). Null when it does not. */
export function parseSalary(posting: string): { min: number | null; max: number | null } {
  const m = posting.match(/Plat\s+(?:od\s+)?([\d\s\u00a0\u202f]{4,})(?:[^\d]{1,15}?([\d\s\u00a0\u202f]{4,}))?\s*(?:Kč|CZK)/)
  const num = (s: string | undefined) => {
    const n = s ? Number(s.replace(/\D/g, '')) : NaN
    return Number.isFinite(n) && n >= 1_000 && n <= 1_000_000 ? n : null
  }
  return { min: num(m?.[1]), max: num(m?.[2]) }
}
