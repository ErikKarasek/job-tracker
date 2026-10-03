// The shared AI client: Gemini first, the next Gemini model on an error, Workers AI past the last
// one, and a run that reached Workers AI stays there. Run with: npm run test:unit
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { chat } from '../../server/ai/chat.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answers each Gemini model with the status given for it; records which models were asked. */
function fakeGemini(statusByModel: Record<string, number>) {
  const asked: string[] = []
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const { model } = JSON.parse(String(init.body))
    asked.push(model)
    const status = statusByModel[model] ?? 200
    const body = status === 200 ? { choices: [{ message: { content: `from ${model}`, tool_calls: [{ id: 't1', function: { name: 'x', arguments: '{}' }, extra_content: { google: { thought_signature: 'sig' } } }] } }] } : { error: 'quota' }
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return asked
}

function fakeWorkers() {
  const calls: string[] = []
  const AI = { run: async (model: string) => (calls.push(model), { choices: [{ message: { content: 'from workers' } }], usage: { neurons: 42 } }) } as never
  return { AI, calls }
}

const req = { messages: [{ role: 'user' as const, content: 'hi' }], max_tokens: 10 }

test('without a key it is Workers AI, as before', async () => {
  const w = fakeWorkers()
  const out = await chat({ AI: w.AI }, 'smart')(req)
  assert.equal(out.content, 'from workers')
  assert.equal(out.neurons, 42)
  assert.deepEqual(w.calls, ['@cf/mistralai/mistral-small-3.1-24b-instruct'])
})

test('with a key Gemini answers and Workers AI is not touched', async () => {
  const asked = fakeGemini({})
  const w = fakeWorkers()
  const out = await chat({ AI: w.AI, GEMINI_API_KEY: 'k' }, 'smart')(req)
  assert.equal(out.via, 'gemini-3.8-flash')
  assert.equal(out.neurons, 0)
  assert.deepEqual(asked, ['gemini-3.8-flash'])
  assert.equal(w.calls.length, 0)
  // The thought signature survives, so the tool call can go back in the history as it came.
  assert.deepEqual((out.tool_calls[0] as unknown as { extra_content: unknown }).extra_content, { google: { thought_signature: 'sig' } })
})

test('a model at its limit hands over to the next one, and the run stays on it', async () => {
  const asked = fakeGemini({ 'gemini-3.8-flash': 429 })
  const w = fakeWorkers()
  const ask = chat({ AI: w.AI, GEMINI_API_KEY: 'k' }, 'smart')
  assert.equal((await ask(req)).via, 'gemini-2.5-flash')
  assert.equal((await ask(req)).via, 'gemini-2.5-flash')
  assert.deepEqual(asked, ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash'])
})

test('past the last Gemini model it is Workers AI, for the rest of the run', async () => {
  const asked = fakeGemini({ 'gemini-3.5-flash-lite': 429, 'gemini-2.5-flash-lite': 500 })
  const w = fakeWorkers()
  const ask = chat({ AI: w.AI, GEMINI_API_KEY: 'k' }, 'cheap')
  assert.equal((await ask(req)).content, 'from workers')
  assert.equal((await ask(req)).content, 'from workers')
  assert.deepEqual(asked, ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'])
  assert.deepEqual(w.calls, ['@cf/meta/llama-3.1-8b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct-fp8-fast'])
})

test('a JSON answer from Workers AI that arrives parsed comes back as text', async () => {
  const AI = { run: async () => ({ response: { fitScore: 70 } }) } as never
  const out = await chat({ AI }, 'cheap')({ ...req, schema: { type: 'object' } })
  assert.deepEqual(JSON.parse(out.content!), { fitScore: 70 })
})
