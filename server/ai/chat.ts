// One way to ask a model, for every AI feature. Gemini first, Workers AI as the fallback.
//
// Gemini's free tier (a key from Google AI Studio, no card) covers what this app needs, and
// keeps the Workers AI allocation for the portfolio's chat, which shares it. The free tier has
// its own per-model limits and Google can change which models it includes, so any error from
// Gemini (a 429 at the limit, a model gone from the free tier, a timeout) moves the call to the
// next Gemini model, and past the last one to Workers AI, which is what ran here before. A
// client stays on whatever worked: a tool loop that started on Workers AI does not hop back,
// because Gemini 3 rejects tool-call history it did not produce itself.
//
// Gemini is called through its OpenAI-compatible endpoint, which takes and returns the same
// messages and tool calls as Workers AI, so the features keep one message format. In the EEA
// Google treats the free tier like the paid one: prompts are not used for training.

export type Llm = { AI: Ai; GEMINI_API_KEY?: string }

/** 'smart' for tool loops and writing in Czech; 'cheap' for the scout's first-pass ranking. */
export type Tier = 'smart' | 'cheap'

export type RawToolCall = { id: string; type?: 'function'; function: { name: string; arguments: unknown } }
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: RawToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ChatRequest = {
  messages: ChatMessage[]
  tools?: unknown[]
  /** For Workers AI. Gemini's thinking counts against the same limit, so it gets none. */
  max_tokens: number
  /** Ask for JSON matching this schema instead of free text. */
  schema?: Record<string, unknown>
}

export type ChatReply = {
  content: string | null
  tool_calls: RawToolCall[]
  /** Workers AI spend, for budget.ts. Gemini's free tier costs nothing and records nothing. */
  neurons: number
  /** Which model answered, for the logs. */
  via: string
}

// Newest first. Each has its own free-tier limit, so the others also add headroom. Checked
// 2026-10-03 with an AI Studio key: the 2.5 models are closed to new keys (404), and 3.7 Flash
// answered 503 (high demand), so it is left out.
const GEMINI: Record<Tier, string[]> = {
  smart: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'],
  cheap: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
}
// What ran before Gemini. Mistral won a side-by-side of five tool-calling models on speed and
// Czech; Llama is the cheap first pass (score.ts has the measurements).
const WORKERS: Record<Tier, string> = {
  smart: '@cf/mistralai/mistral-small-3.1-24b-instruct',
  cheap: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
}
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
// A brief's last turn writes the whole thing; a minute is generous for it.
const GEMINI_TIMEOUT_MS = 60_000

/** A client for one feature run; call it once per turn. */
export function chat(env: Llm, tier: Tier) {
  const models = env.GEMINI_API_KEY ? [...GEMINI[tier]] : []
  // Once a turn has gone to Workers AI, the rest of the run stays there.
  let onWorkers = models.length === 0

  return async (req: ChatRequest): Promise<ChatReply> => {
    while (!onWorkers && models.length > 0) {
      const model = models[0]
      try {
        return await gemini(env.GEMINI_API_KEY!, model, req)
      } catch (err) {
        console.warn(`[ai] ${model} failed, trying the next model: ${String(err).slice(0, 300)}`)
        models.shift()
      }
    }
    onWorkers = true
    return workers(env.AI, WORKERS[tier], req)
  }
}

async function gemini(key: string, model: string, req: ChatRequest): Promise<ChatReply> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: req.messages,
      tools: req.tools,
      // Thinking helps little with these tasks and slows every turn; 'low' keeps it short.
      reasoning_effort: 'low',
      response_format: req.schema ? { type: 'json_schema', json_schema: { name: 'answer', schema: req.schema } } : undefined,
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const out = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: RawToolCall[] } }[] }
  const message = out.choices?.[0]?.message
  if (!message) throw new Error('No message in the reply.')
  // Kept whole, extra fields included: Gemini 3 needs the thought signature it attaches to each
  // tool call sent back with the history.
  return { content: message.content ?? null, tool_calls: message.tool_calls ?? [], neurons: 0, via: model }
}

async function workers(ai: Ai, model: string, req: ChatRequest): Promise<ChatReply> {
  const out = (await ai.run(model as keyof AiModels, {
    messages: req.messages,
    tools: req.tools,
    max_tokens: req.max_tokens,
    response_format: req.schema ? { type: 'json_schema', json_schema: req.schema } : undefined,
  } as never)) as {
    response?: unknown
    choices?: { message?: { content?: string | null; tool_calls?: RawToolCall[] } }[]
    usage?: { neurons?: number }
  }
  const message = out.choices?.[0]?.message
  // Some models answer in `response`, and in JSON mode it can arrive already parsed.
  const content = message?.content ?? (typeof out.response === 'string' ? out.response : out.response != null ? JSON.stringify(out.response) : null)
  return { content, tool_calls: message?.tool_calls ?? [], neurons: Math.round(out.usage?.neurons ?? 0), via: model }
}
