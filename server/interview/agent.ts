// The interview-prep agent. Unlike the posting agent, which follows a fixed three-step path,
// this one navigates: fetch_page hands back a page's text and its links, and the model decides
// which to follow (the company's site, its "about" or product pages) until it knows enough, then
// writes the brief. That freedom needs fences, all enforced here rather than asked for:
//   - it may only open the posting, sites linked from the job board's pages (a Jobs.cz company
//     profile links the company's own site), and a domain that carries the company's name;
//   - at most MAX_PAGES pages and MAX_TURNS turns;
//   - the brief's answers must stand on the profile's real experience.
import { PROFILE } from '../agent/profile'
import { htmlToText } from '../agent/tools'

const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'
const MAX_TURNS = 7
const MAX_PAGES = 4
const PAGE_CHARS = 6_000

export type Brief = {
  company: string
  role: string
  questions: { question: string; answer: string }[]
  topics: string[]
  ask: string[]
  gaps: { gap: string; handle: string }[]
  /** Pages the agent actually read, recorded by the code, not reported by the model. */
  sources: string[]
}

// Links to these never lead anywhere useful for a brief, and would only spend a page.
const NOT_WORTH_A_PAGE = /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|google|apple\.com|cookiebot|onetrust|gstatic)/i

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_page',
      description:
        "Read a web page: returns its text and the links on it. Only the posting and sites linked from pages you have already read can be opened. Use it to find the company's own site and read what it does.",
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_brief',
      description: 'Finish: hand Erik the interview brief. Call once, as the last step.',
      parameters: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'What the company does, for whom, how big, in 2-4 sentences. Only what the pages say.' },
          role: { type: 'string', description: 'What the job is really about and what they will test for, 2-3 sentences' },
          questions: {
            type: 'array',
            description: '8-10 questions this interviewer is likely to ask, each with an answer outline for Erik',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                answer: {
                  type: 'string',
                  description: 'How Erik can answer, built on a concrete experience or project from his profile (situation, what he did, result). Never invent experience.',
                },
              },
              required: ['question', 'answer'],
            },
          },
          topics: { type: 'array', items: { type: 'string' }, description: 'Technical topics from the posting worth revising before the interview' },
          ask: { type: 'array', items: { type: 'string' }, description: '4-5 good questions Erik can ask them' },
          gaps: {
            type: 'array',
            description: 'Requirements Erik does not meet yet, and how to talk about each honestly',
            items: { type: 'object', properties: { gap: { type: 'string' }, handle: { type: 'string' } }, required: ['gap', 'handle'] },
          },
        },
        required: ['company', 'role', 'questions', 'topics', 'ask', 'gaps'],
      },
    },
  },
]

const SYSTEM = `You prepare Erik for a job interview. Start by calling fetch_page on the posting. Then find the company's own website and read one or two of its pages (about us, products, what they build). Then call submit_brief.

Finding the company's site: on Jobs.cz the posting links the company's profile (a /fp/ link), and that profile links the company's own website. If there is no such link, try the likely domain from the company name, e.g. https://companyname.cz.

Rules:
- Write everything in Czech. If the posting itself is in English, write the questions and answers in English, the rest in Czech.
- Say only what the pages say about the company; if you could not find something, leave it out rather than guess.
- Every answer outline must use a real experience or project from Erik's profile. Never invent experience, numbers or technologies.
- Be concrete and brief: an outline Erik can glance at before walking in, not an essay.

Erik's profile:
${PROFILE}`

type RawToolCall = { id: string; function: { name: string; arguments: unknown } }
type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: RawToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export async function writeBrief(ai: Ai, company: string, postingUrl: string, postingText?: string): Promise<{ brief: Brief; neurons: number }> {
  const allowed = new Set<string>()
  const allow = (url: string) => {
    const h = hostOf(url)
    if (h) allowed.add(h)
  }
  allow(postingUrl)
  const boardHost = hostOf(postingUrl)
  const companyKey = nameKey(company)
  // Pasted text replaces the posting page, so the sites it names count as linked.
  for (const m of postingText?.matchAll(/https?:\/\/[^\s"')<>]+/g) ?? []) allow(m[0])
  const read: string[] = []
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: postingText
        ? `The posting for ${company} (${postingUrl}), pasted because its page cannot be read:\n\n${postingText.slice(0, PAGE_CHARS)}`
        : `The posting for ${company}: ${postingUrl}`,
    },
  ]
  let neurons = 0

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // On the last turn only submit_brief is offered, so the run always ends with a brief.
    const last = turn === MAX_TURNS - 1 || read.length >= MAX_PAGES
    const out = (await ai.run(MODEL as keyof AiModels, {
      messages,
      tools: last ? [TOOLS[1]] : TOOLS,
      max_tokens: 2_500,
    } as never)) as { choices?: { message?: { content?: string | null; tool_calls?: RawToolCall[] } }[]; usage?: { neurons?: number } }
    neurons += out.usage?.neurons ?? 0
    const message = out.choices?.[0]?.message
    const calls = message?.tool_calls ?? []

    if (calls.length === 0) {
      messages.push({ role: 'assistant', content: message?.content ?? '' })
      messages.push({ role: 'user', content: 'Do not answer in text. Use the tools; finish with submit_brief.' })
      continue
    }
    messages.push({ role: 'assistant', content: message?.content ?? null, tool_calls: calls })

    for (const call of calls) {
      const args = parse(call.function.arguments)
      if (call.function.name === 'submit_brief') {
        const brief = validate(args, read)
        if (brief) return { brief, neurons: Math.round(neurons) }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Fill company, role, at least 5 questions with answers, topics and ask.' }) })
        continue
      }
      const result = read.length >= MAX_PAGES ? { error: 'Page limit reached; write the brief now.' } : await fetchPage(String(args.url ?? ''), { allowed, boardHost, companyKey }, read)
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
  throw new Error(`No brief after ${MAX_TURNS} turns.`)
}

type Fence = { allowed: Set<string>; boardHost: string | null; companyKey: string }

async function fetchPage(url: string, fence: Fence, read: string[]) {
  const host = hostOf(url)
  if (!host) return { error: 'Not an http(s) URL.' }
  // The domain is the company's name, or the start of it ("eldis.cz" for "ELDIS Pardubice");
  // a domain that merely contains it ("evilunicorn.com") does not count.
  const site = nameKey(host.split('.').slice(0, -1).join(''))
  const namedAfterCompany = site.length >= 4 && (site === fence.companyKey || fence.companyKey.startsWith(site))
  if (!fence.allowed.has(host) && !namedAfterCompany) {
    return { error: `${host} is neither linked from the job board nor named after the company.` }
  }
  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerAgent/1.0)', 'Accept-Language': 'cs,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    html = await res.text()
  } catch (err) {
    return { error: `Could not load: ${String(err)}` }
  }
  read.push(url)

  const links = extractLinks(html, url)
  // The job board's pages (the posting, the company profile) may send the agent wherever they
  // link, which is how it reaches the company's site; that site keeps it on that site.
  fence.allowed.add(host)
  if (host === fence.boardHost) for (const l of links) {
    const h = hostOf(l.url)
    if (h) fence.allowed.add(h)
  }
  const text = htmlToText(html)
  return {
    text: text.slice(0, PAGE_CHARS),
    note: text.length < 800 ? 'Almost no text: this page is drawn with JavaScript. Try another link.' : undefined,
    links: links.slice(0, 40),
  }
}

export function extractLinks(html: string, base: string) {
  const seen = new Set<string>()
  const links: { text: string; url: string }[] = []
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), base).toString()
    } catch {
      continue
    }
    if (!/^https?:/.test(url) || NOT_WORTH_A_PAGE.test(url) || seen.has(url)) continue
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!text) continue
    seen.add(url)
    links.push({ text, url })
  }
  return links
}

/** "DEEP VISION s.r.o." → "deepvision": the part of a company name a domain would carry. */
function nameKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(s\.?\s?r\.?\s?o|a\.?\s?s|spol|group|skupina|czech republic|cz|ceska republika)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function hostOf(url: string) {
  try {
    const u = new URL(url)
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

function parse(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const v = JSON.parse(String(raw))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [])

function validate(a: Record<string, unknown>, read: string[]): Brief | null {
  const questions = (Array.isArray(a.questions) ? a.questions : [])
    .map((q) => q as { question?: unknown; answer?: unknown })
    .filter((q) => typeof q.question === 'string' && typeof q.answer === 'string')
    .map((q) => ({ question: String(q.question).trim(), answer: String(q.answer).trim() }))
  const gaps = (Array.isArray(a.gaps) ? a.gaps : [])
    .map((g) => g as { gap?: unknown; handle?: unknown })
    .filter((g) => typeof g.gap === 'string')
    .map((g) => ({ gap: String(g.gap).trim(), handle: String(g.handle ?? '').trim() }))
  const company = typeof a.company === 'string' ? a.company.trim() : ''
  const role = typeof a.role === 'string' ? a.role.trim() : ''
  if (!company || !role || questions.length < 5) return null
  return { company, role, questions, topics: strings(a.topics), ask: strings(a.ask), gaps, sources: [...read] }
}
