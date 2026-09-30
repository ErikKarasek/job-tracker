// The scout's messages to Telegram: the same bot and chat as the job-mail digest, so everything
// about the job hunt lands in one place. Secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the
// scout Worker; without them the caller falls back to e-mail.
import type { Brief } from '../interview/agent'

const BOARD = 'https://job-tracker-10s.pages.dev'
// Telegram refuses a message over 4096 characters; leave room for the tags.
const LIMIT = 3800

export type TelegramEnv = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string }

export const telegramReady = (env: TelegramEnv) => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function send(env: TelegramEnv, text: string, buttons?: { text: string; url: string }[]) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(buttons ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`)
}

/**
 * The interview brief as a few messages: a header with the links, then each part folded in an
 * expandable quote, so the chat stays short but everything is a tap away. Parts are grouped into
 * as few messages as fit under Telegram's limit.
 */
export async function sendBrief(env: TelegramEnv, card: { company: string; role: string; job_url: string | null }, brief: Brief | null) {
  const buttons = [{ text: 'Otevřít board', url: BOARD }, ...(card.job_url ? [{ text: 'Inzerát', url: card.job_url }] : [])]
  const head = `<b>🎤 Zítra pohovor</b>\n<b>${esc(card.company)}</b> – ${esc(card.role)}`
  if (!brief) {
    await send(env, `${head}\n\nPříprava zatím není hotová. Otevři kartu na boardu a nech ji napsat.`, buttons)
    return 'telegram: no brief yet'
  }

  const fold = (title: string, body: string) => `<b>${title}</b>\n<blockquote expandable>${esc(body)}</blockquote>`
  const parts = [
    fold(`Pravděpodobné otázky (${brief.questions.length})`, brief.questions.map((q, i) => `${i + 1}. ${q.question}\n→ ${q.answer}`).join('\n\n')),
    brief.topics.length ? fold('Zopakovat si', brief.topics.map((t) => `• ${t}`).join('\n')) : '',
    brief.gaps.length ? fold('Na co se připravit', brief.gaps.map((g) => `• ${g.gap}: ${g.handle}`).join('\n')) : '',
    brief.ask.length ? fold('Zeptej se jich', brief.ask.map((a) => `• ${a}`).join('\n')) : '',
  ].filter(Boolean)

  await send(env, `${head}\n\n${fold('Firma', brief.company)}`, buttons)
  let chunk = ''
  let sent = 1
  for (const p of parts) {
    // A part longer than the limit on its own is cut; the full brief is on the card.
    const part = p.length > LIMIT ? `${p.slice(0, LIMIT - 60)}…</blockquote>\n<i>Celé na kartě na boardu.</i>` : p
    if (chunk && chunk.length + part.length + 2 > LIMIT) {
      await send(env, chunk)
      sent++
      chunk = ''
    }
    chunk = chunk ? `${chunk}\n\n${part}` : part
  }
  if (chunk) {
    await send(env, chunk)
    sent++
  }
  return `telegram: ${sent} messages`
}
