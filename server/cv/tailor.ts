// A CV fitted to one posting: the same facts, in the order and with the emphasis that posting
// cares about. One model call, no loop: there is nothing to look up and no step that depends
// on another, so an agent would only add turns.
//
// The model may only reorder what the résumé already holds and rewrite the headline and profile
// paragraph. Every project, skill and technology name it returns is checked against the résumé,
// and anything missing is put back, so it can reorder but never invent or drop.
import { cv, type CvLang } from './content'

const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'

export type Tailoring = {
  lang: CvLang
  title: string
  profile: string
  projectOrder: string[]
  skillOrder: string[]
  techOrder: string[]
  /** One line on what was emphasised and why, shown above the CV. */
  rationale: string
}

const TOOL = {
  type: 'function',
  function: {
    name: 'tailor_cv',
    description: 'Return how to present the résumé for this posting.',
    parameters: {
      type: 'object',
      properties: {
        lang: { type: 'string', enum: ['cs', 'en'], description: 'cs unless the posting is written in English' },
        title: { type: 'string', description: 'Headline under the name, max 60 characters, naming the kind of role applied for' },
        profile: {
          type: 'string',
          description: 'The profile paragraph rewritten for this role, 3-4 sentences, in the chosen language, first person, only facts from the résumé',
        },
        projectOrder: { type: 'array', items: { type: 'string' }, description: 'All project names, most relevant first' },
        skillOrder: { type: 'array', items: { type: 'string' }, description: 'All skill names (the left side of each skill pair), most relevant first' },
        techOrder: { type: 'array', items: { type: 'string' }, description: 'All key technologies, most relevant first' },
        rationale: { type: 'string', description: 'One sentence in Czech: what the CV now puts first, and why' },
      },
      required: ['lang', 'title', 'profile', 'projectOrder', 'skillOrder', 'techOrder', 'rationale'],
    },
  },
}

function resumeFor(lang: CvLang) {
  const d = cv[lang]
  return JSON.stringify({
    title: d.title,
    profile: d.profile,
    jobs: d.jobs.map((j) => ({ role: j.role, where: j.where, when: j.when, points: j.points })),
    projects: d.projects.map((p) => ({ name: p.name, points: p.points })),
    skills: d.skills.map(([name, detail]) => ({ name, detail })),
    tech: d.tech,
  })
}

export async function tailorCv(ai: Ai, posting: string): Promise<{ tailoring: Tailoring; neurons: number }> {
  const messages = [
    {
      role: 'system',
      content: `You tailor Erik's résumé to one job posting. You only reorder and re-emphasise what the résumé already says; you never add experience, skills, numbers or technologies it does not contain. Always call tailor_cv.

Résumé in Czech:
${resumeFor('cs')}

Résumé in English:
${resumeFor('en')}`,
    },
    { role: 'user', content: `Job posting:\n\n${posting.slice(0, 8_000)}` },
  ]

  let neurons = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = (await ai.run(MODEL as keyof AiModels, { messages, tools: [TOOL], max_tokens: 900 } as never)) as {
      choices?: { message?: { tool_calls?: { function: { arguments: unknown } }[] } }[]
      usage?: { neurons?: number }
    }
    neurons += out.usage?.neurons ?? 0
    const raw = out.choices?.[0]?.message?.tool_calls?.[0]?.function.arguments
    const args = typeof raw === 'string' ? safeParse(raw) : (raw as Record<string, unknown> | undefined)
    const tailoring = args && validate(args)
    if (tailoring) return { tailoring, neurons: Math.round(neurons) }
    messages.push({ role: 'user', content: 'Call tailor_cv with every required field.' })
  }
  throw new Error('The model did not return a usable tailoring.')
}

function safeParse(s: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

/** Keep only names the résumé has, in the model's order, then put back any it left out. */
function reorder(wanted: unknown, known: readonly string[]): string[] {
  const norm = (s: string) => s.trim().toLowerCase()
  const byNorm = new Map(known.map((k) => [norm(k), k]))
  const out: string[] = []
  for (const w of Array.isArray(wanted) ? wanted : []) {
    const k = typeof w === 'string' ? byNorm.get(norm(w)) : undefined
    if (k && !out.includes(k)) out.push(k)
  }
  return [...out, ...known.filter((k) => !out.includes(k))]
}

function validate(a: Record<string, unknown>): Tailoring | null {
  const lang: CvLang = a.lang === 'en' ? 'en' : 'cs'
  const d = cv[lang]
  const title = typeof a.title === 'string' ? a.title.trim().slice(0, 80) : ''
  const profile = typeof a.profile === 'string' ? a.profile.trim() : ''
  if (!title || profile.length < 80) return null
  return {
    lang,
    title,
    profile,
    projectOrder: reorder(a.projectOrder, d.projects.map((p) => p.name)),
    skillOrder: reorder(a.skillOrder, d.skills.map(([name]) => name)),
    techOrder: reorder(a.techOrder, d.tech),
    rationale: typeof a.rationale === 'string' ? a.rationale.trim() : '',
  }
}
