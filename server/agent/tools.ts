// The job-posting agent's tools. Each one is two halves: a JSON-schema description the model
// reads to decide when and how to call it, and the function that runs when it does. The model
// never executes anything itself; it asks, and run.ts calls the function here.
import type { Env } from '../types'

export type ToolCall = { name: string; arguments: Record<string, unknown> }

export type Draft = {
  company: string
  role: string
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  source: string | null
  fitScore: number
  fitSummary: string
  coverLetter: string
  /** Set when find_applications turned up a card for the same role already. */
  duplicateOf: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

// Below this, a "posting" is a cookie banner and a menu: the page draws its content with
// JavaScript (StartupJobs, LinkedIn, most company career sites), and a server-side fetch only
// sees the empty shell. Measured on real pages: a Jobs.cz posting reads 9 000+ characters,
// a JavaScript-drawn one under 2 500.
const MIN_POSTING_CHARS = 2_500
// Enough for any posting; stops a huge page from eating the whole daily allocation.
const MAX_POSTING_CHARS = 8_000

export async function fetchJobPosting(args: Record<string, unknown>): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const url = str(args.url)
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, reason: 'Not an http(s) URL.' }
  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerAgent/1.0)', 'Accept-Language': 'cs,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { ok: false, reason: `The page answered HTTP ${res.status}.` }
    html = await res.text()
  } catch (err) {
    return { ok: false, reason: `Could not load the page: ${String(err)}` }
  }
  const text = htmlToText(html)
  if (text.length < MIN_POSTING_CHARS) {
    return {
      ok: false,
      reason:
        'The page has almost no text; it is drawn with JavaScript, so the posting cannot be read from here. Ask the user to paste the posting text instead.',
    }
  }
  return { ok: true, text: text.slice(0, MAX_POSTING_CHARS) }
}

function htmlToText(html: string) {
  return html
    // Not <header>: posting pages often put the job title in one.
    .replace(/<(script|style|noscript|svg|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

async function findApplications(args: Record<string, unknown>, env: Env) {
  const company = str(args.company)
  if (!company) return { matches: [] }
  const { results } = await env.DB.prepare(
    'SELECT id, company, role, stage, applied_date FROM applications WHERE company LIKE ? ORDER BY last_activity_at DESC LIMIT 10',
  )
    .bind(`%${company}%`)
    .all()
  return { matches: results }
}

export function toDraft(args: Record<string, unknown>): Draft | null {
  const company = str(args.company)
  const role = str(args.role)
  const fitScore = int(args.fitScore)
  if (!company || !role || fitScore === null) return null
  return {
    company,
    role,
    location: str(args.location),
    salaryMin: int(args.salaryMin),
    salaryMax: int(args.salaryMax),
    source: str(args.source),
    fitScore: Math.min(100, Math.max(0, fitScore)),
    fitSummary: str(args.fitSummary) ?? '',
    coverLetter: str(args.coverLetter) ?? '',
    duplicateOf: str(args.duplicateOf),
  }
}

/** What the model is told about each tool, in the OpenAI function-calling shape Workers AI takes. */
export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'fetch_job_posting',
      description: 'Download a job posting page and return its text. Fails on pages drawn with JavaScript.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The posting URL' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_applications',
      description: 'Search the tracker for existing applications at a company, to catch duplicates.',
      parameters: {
        type: 'object',
        properties: { company: { type: 'string', description: 'Company name, or a distinctive part of it' } },
        required: ['company'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_draft',
      description: 'Finish: hand the user a draft card to review. Call exactly once, as the last step.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          role: { type: 'string' },
          location: { type: 'string', description: 'City, or "remote" / "hybrid"' },
          salaryMin: { type: 'number', description: 'Monthly CZK, only if the posting states it' },
          salaryMax: { type: 'number', description: 'Monthly CZK, only if the posting states it' },
          source: { type: 'string', description: 'Where the posting is, e.g. "Jobs.cz"' },
          fitScore: { type: 'number', description: '0-100: how well the profile matches the requirements' },
          fitSummary: { type: 'string', description: 'Two sentences: the strongest match and the biggest gap' },
          coverLetter: { type: 'string', description: 'A short cover letter in the language of the posting' },
          duplicateOf: { type: 'string', description: 'id of an existing card for the same role, if any' },
        },
        required: ['company', 'role', 'fitScore', 'fitSummary', 'coverLetter'],
      },
    },
  },
]

/** Runs one tool call. `submit_draft` is handled by the loop itself, since it ends the run. */
export async function runTool(call: ToolCall, env: Env): Promise<unknown> {
  switch (call.name) {
    case 'fetch_job_posting':
      return fetchJobPosting(call.arguments)
    case 'find_applications':
      return findApplications(call.arguments, env)
    default:
      return { error: `There is no tool called ${call.name}.` }
  }
}
