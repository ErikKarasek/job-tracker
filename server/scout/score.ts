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

const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast'

const SCHEMA = {
  type: 'object',
  properties: { fitScore: { type: 'integer' }, fitSummary: { type: 'string' } },
  required: ['fitScore', 'fitSummary'],
}

const SYSTEM = `You judge how well a job posting fits Erik. Answer with JSON only:
- fitScore: 0-100, honest. 80+ only when he meets nearly every hard requirement. Missing years of experience, a degree, or a core technology the posting requires is a real gap and pulls the score down.
- fitSummary: two sentences in English. First: which of the posting's requirements Erik meets best, naming his concrete experience. Second: which requirement of the posting he lacks. Never describe what the posting fails to mention.

Erik's profile:
${PROFILE}`

export async function scoreFit(ai: Ai, posting: string): Promise<{ fitScore: number; fitSummary: string; neurons: number }> {
  const out = (await ai.run(MODEL as keyof AiModels, {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Job posting:\n\n${posting.slice(0, 8_000)}` },
    ],
    max_tokens: 250,
    response_format: { type: 'json_schema', json_schema: SCHEMA },
  } as never)) as { response?: unknown; choices?: { message?: { content?: unknown } }[]; usage?: { neurons?: number } }

  const raw = out.response ?? out.choices?.[0]?.message?.content
  const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { fitScore?: unknown; fitSummary?: unknown }
  const fitScore = typeof data?.fitScore === 'number' ? Math.min(100, Math.max(0, Math.round(data.fitScore))) : null
  const fitSummary = typeof data?.fitSummary === 'string' ? data.fitSummary.trim() : ''
  if (fitScore === null || !fitSummary) throw new Error('The model returned no usable score.')
  return { fitScore, fitSummary, neurons: Math.round(out.usage?.neurons ?? 0) }
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
