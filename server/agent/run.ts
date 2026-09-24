// The job-posting agent: a model in a loop, with tools.
//
// Each turn the model either asks for tools (fetch the posting, look for duplicates) or stops.
// We run what it asked for, append the results to the conversation, and go round again, until
// it calls submit_draft, which ends the run with a card for the user to review. Nothing is
// written to the board here: saving stays a human decision, made in the UI.
import type { Env } from '../types'
import { PROFILE } from './profile'
import { TOOL_SCHEMAS, runTool, toDraft, type Draft, type ToolCall } from './tools'

// Chosen after a side-by-side on Workers AI: all five candidates could call tools, and Mistral
// did it fastest (about 1.4 s a turn) with the most natural Czech, which the cover letters need.
const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct'
// A normal run takes three turns: fetch, find_applications, submit_draft. The cap is for a model
// that goes round in circles, which otherwise spends the daily allocation on nothing.
const MAX_TURNS = 6

export type TraceStep =
  | { kind: 'tool'; name: string; arguments: Record<string, unknown>; result: string }
  | { kind: 'message'; text: string }

// `neurons` is what the run cost out of the Workers AI daily allocation (10 000 free).
export type AgentResult = { trace: TraceStep[]; neurons: number } & (
  | { status: 'draft'; draft: Draft }
  // The model stopped without a draft; `message` is what it said, e.g. "paste the text".
  | { status: 'needs_input'; message: string }
  | { status: 'failed'; message: string }
)

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: RawToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
type RawToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type ModelOutput = {
  choices?: { message?: { content?: string | null; tool_calls?: RawToolCall[] } }[]
  usage?: { neurons?: number }
}

const SYSTEM = `You help Erik track job applications. Given a job posting (a URL or its pasted text), you:
1. Read the posting. For a URL, call fetch_job_posting. If that fails, stop and ask Erik, in Czech, to paste the posting text.
2. Call find_applications with the company name, to catch a card that already exists.
3. Compare the requirements with Erik's profile below and call submit_draft.

Rules:
- Use only facts from the posting and the profile. Never invent salary, location or requirements.
- fitScore is honest: 80+ only when he meets nearly every hard requirement. Missing years of experience or a core technology is a real gap.
- The cover letter is 120-180 words and cites concrete projects from the profile that match the role. No clichés, no made-up experience.
- Write the cover letter in Czech, unless the posting itself is written in English. An English job title alone does not make the posting English.
- Write fitSummary in English, the language of the tracker's interface.
- Credit a project only with the technologies the profile lists for it (Nexus Grind is TypeScript, not Python).
- If find_applications shows the same role at that company, pass its id as duplicateOf.

Erik's profile:
${PROFILE}`

const brief = (value: unknown) => {
  const s = JSON.stringify(value)
  return s.length > 300 ? `${s.slice(0, 300)}…` : s
}

export async function runAgent(env: Env & { AI: Ai }, input: { url?: string; text?: string }): Promise<AgentResult> {
  const trace: TraceStep[] = []
  const task = input.text
    ? `Here is a job posting${input.url ? ` from ${input.url}` : ''}:\n\n${input.text.slice(0, 8_000)}`
    : `Job posting URL: ${input.url}`
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: task },
  ]

  let neurons = 0
  let havePosting = Boolean(input.text)
  let nudged = false

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const out = (await env.AI.run(MODEL as keyof AiModels, {
      messages,
      tools: TOOL_SCHEMAS,
      max_tokens: 900,
    } as never)) as ModelOutput
    neurons += out.usage?.neurons ?? 0
    const message = out.choices?.[0]?.message
    const calls = message?.tool_calls ?? []

    // No tool asked for: the model is talking to the user.
    if (calls.length === 0) {
      const text = message?.content?.trim() || 'The agent stopped without an answer.'
      trace.push({ kind: 'message', text })
      // With the posting in hand, a text reply is the model writing the draft out as prose
      // instead of calling submit_draft, which the UI cannot use. Seen in testing; one nudge
      // is usually enough. Without the posting, the text is a real question for the user.
      if (havePosting && !nudged) {
        nudged = true
        messages.push({ role: 'assistant', content: text })
        messages.push({ role: 'user', content: 'Do not answer in text. Call submit_draft now with that draft.' })
        continue
      }
      return { status: 'needs_input', message: text, trace, neurons: Math.round(neurons) }
    }

    messages.push({ role: 'assistant', content: message?.content ?? null, tool_calls: calls })

    for (const raw of calls) {
      const call: ToolCall = { name: raw.function.name, arguments: parseArgs(raw.function.arguments) }

      if (call.name === 'submit_draft') {
        const draft = toDraft(call.arguments)
        trace.push({ kind: 'tool', name: call.name, arguments: call.arguments, result: draft ? 'draft ready' : 'rejected' })
        if (draft) return { status: 'draft', draft: { ...draft, duplicateOf: await findDuplicate(env, draft) }, trace, neurons: Math.round(neurons) }
        // Tell the model what was wrong and let it try again, like any other tool error.
        messages.push({ role: 'tool', tool_call_id: raw.id, content: JSON.stringify({ error: 'company, role and fitScore are required.' }) })
        continue
      }

      const result = await runTool(call, env)
      if (call.name === 'fetch_job_posting' && (result as { ok?: boolean }).ok) havePosting = true
      trace.push({ kind: 'tool', name: call.name, arguments: call.arguments, result: brief(result) })
      messages.push({ role: 'tool', tool_call_id: raw.id, content: JSON.stringify(result) })
    }
  }

  return { status: 'failed', message: `No draft after ${MAX_TURNS} turns.`, trace, neurons: Math.round(neurons) }
}

// Same company and same role is a duplicate. Decided here in SQL rather than trusted to the
// model: in testing it found the existing card and then forgot to say so.
async function findDuplicate(env: Env, draft: Draft): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM applications
     WHERE lower(company) LIKE '%' || lower(?) || '%' AND lower(role) = lower(?)
     LIMIT 1`,
  )
    .bind(draft.company.replace(/\s+(s\.r\.o\.|a\.s\.|spol\..*)$/i, ''), draft.role)
    .first<{ id: string }>()
  return row?.id ?? draft.duplicateOf
}

// Workers AI hands arguments back as a JSON string for some models and an object for others.
function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
