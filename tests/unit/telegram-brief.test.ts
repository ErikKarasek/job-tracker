// Every brief message stays under Telegram's 4096-character limit, including the header one, where
// the card's company and role are added on top of a folded part. Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendBrief } from '../../server/scout/telegram.ts'
import type { Brief } from '../../server/interview/agent.ts'

// Telegram refuses a message over this many characters with a 400.
const API_LIMIT = 4096
const env = { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' }

const brief = (over: string): Brief => ({
  company: over,
  role: 'Backend Engineer',
  questions: Array.from({ length: 10 }, (_, i) => ({ question: `${over} ${i}`, answer: over })),
  topics: [over],
  ask: [over],
  gaps: [{ gap: over, handle: over }],
  sources: [],
})

// Collects the text of every sendMessage call instead of talking to Telegram.
async function texts(card: { company: string; role: string; job_url: string | null }, b: Brief) {
  const sent: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).text)
    return new Response('{"ok":true}', { status: 200 })
  }
  try {
    await sendBrief(env, card, b)
  } finally {
    globalThis.fetch = real
  }
  return sent
}

test('a long brief is cut to fit, with a short company and role', async () => {
  const sent = await texts({ company: 'Kingspan', role: 'Backend Engineer', job_url: null }, brief('&'.repeat(2000)))
  assert.ok(sent.length > 1, 'the brief goes out as several messages')
  for (const [i, text] of sent.entries()) assert.ok(text.length <= API_LIMIT, `message ${i + 1} is ${text.length} characters`)
})

test('a long company and role do not push the header message over the limit', async () => {
  // Both come from the scrape and are unbounded TEXT in the card; the header is prepended to a
  // part that already fills the budget, so it has to be counted against it.
  const card = { company: 'Kingspan'.repeat(40), role: '&'.repeat(200), job_url: null }
  const sent = await texts(card, brief('&'.repeat(2000)))
  for (const [i, text] of sent.entries()) assert.ok(text.length <= API_LIMIT, `message ${i + 1} is ${text.length} characters`)
})

test('an absurd company and role still fit, with a brief', async () => {
  // The fold can only give back the room the quote takes; past that the header itself is the
  // message, so it has to be capped as well.
  const card = { company: 'x'.repeat(5000), role: 'y'.repeat(5000), job_url: null }
  const sent = await texts(card, brief('&'.repeat(2000)))
  for (const [i, text] of sent.entries()) assert.ok(text.length <= API_LIMIT, `message ${i + 1} is ${text.length} characters`)
})

test('the no-brief message fits too, however long the card is', async () => {
  const sent = await texts({ company: 'x'.repeat(5000), role: 'y'.repeat(5000), job_url: null }, null as unknown as Brief)
  assert.equal(sent.length, 1)
  assert.ok(sent[0].length <= API_LIMIT, `message is ${sent[0].length} characters`)
})
