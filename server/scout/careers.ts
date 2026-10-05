// The third source: careers pages of IT employers around Hradec Králové and Pardubice, read
// directly. Some post there first or only there. Import-free, so the unit tests load it as is.
//
// Two ways a page is read, both without a browser:
// - `prefix`: postings are links one level under a URL prefix (STAPRO, RETIA).
// - `within`: postings are links inside elements of one class, at no common path (ELDIS puts
//   them at the site root, /sw-tester).
// Sites built on Unicorn's uu5 are drawn with JavaScript, but the data behind a page comes from a
// public loadWebPage endpoint as JSON (parseUuJobs, uuPostingText below); the agent reads a
// pasted spolu-pracujeme.cz link that way. Unicorn's own list is no longer searched.
// ČEZ is left out: its careers site is kdejinde.jobs.cz, which the Jobs.cz search already covers.
//
// The company names match how Jobs.cz writes them, so a role posted in both places is suggested
// once (insertFound folds duplicates by title and company).
export const CAREER_PAGES = [
  { key: 'stapro', company: 'STAPRO s. r. o.', list: 'https://www.stapro.cz/kariera/', prefix: 'https://www.stapro.cz/pozice/' },
  { key: 'retia', company: 'RETIA, a.s.', list: 'https://www.mametenaradaru.cz/volne-pozice/', prefix: 'https://www.mametenaradaru.cz/volne-pozice/' },
  // A radar maker: most of its openings are production and engineering, hence itOnly.
  { key: 'eldis', company: 'ELDIS Pardubice, s.r.o', list: 'https://www.eldis.cz/volne-pozice', within: 'blog-title', itOnly: true, location: 'Pardubice' },
  // Unicorn (spolu-pracujeme.cz, uuPage: 'prehled-pracovnich-pozic') is left out: Erik works
  // there (EXCLUDED_COMPANIES in tick.ts). The uu5 reading below stays for pasted links.
] as const
export type CareerPage = (typeof CAREER_PAGES)[number]

/**
 * Hosts of the pages above that draw postings on the server, checked by hand. A short posting
 * there is still a posting: ELDIS writes some in under 2 500 characters, which the agent's
 * JavaScript-shell check (tools.ts) would otherwise turn away.
 */
export const SERVER_DRAWN_HOSTS: string[] = CAREER_PAGES.map((p) => new URL(p.list).hostname)

export type CareerPosting = { url: string; title: string; company: string; location: string | null; remote: false }

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerScout/1.0)', 'Accept-Language': 'cs' }

async function get(url: string, what: string) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${what} answered HTTP ${res.status}`)
  return res.text()
}

export async function fetchCareerPage(page: CareerPage): Promise<CareerPosting[]> {
  return parseCareerLinks(await get(page.list, `${page.company} careers page`), page)
}

export function parseCareerLinks(html: string, page: CareerPage): CareerPosting[] {
  const links =
    'within' in page
      ? new RegExp(`class="[^"]*\\b${page.within}\\b[^"]*"[^>]*>\\s*<a\\b[^>]*href="([^"#]+)"[^>]*>([\\s\\S]*?)<\\/a>`, 'gi')
      : /<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const seen = new Set<string>()
  const found: CareerPosting[] = []
  for (const m of html.matchAll(links)) {
    let url: string
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), page.list).toString()
    } catch {
      continue
    }
    if ('prefix' in page) {
      // A posting sits one level under the prefix; the list itself and its pagination do not count.
      const rest = url.startsWith(page.prefix) ? url.slice(page.prefix.length).replace(/\/$/, '') : ''
      if (!rest || rest.includes('/') || rest.startsWith('page')) continue
    }
    if (seen.has(url)) continue
    const title = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (title.length < 4) continue
    seen.add(url)
    found.push({ url, title, company: page.company, location: 'location' in page ? page.location : null, remote: false })
  }
  return found
}

// uu5 sites (Unicorn's own stack) ----------------------------------------------------------------

/** Hosts whose pages are uu5 apps, readable through loadWebPage. */
export const UU_HOSTS = ['spolu-pracujeme.cz']

export const uuPageUrl = (origin: string, code: string) => `${origin}/loadWebPage?code=${encodeURIComponent(code)}`

/** The page's markup: uu5 components as text, in the sections of the JSON the endpoint returns. */
function uuMarkup(json: string): string {
  const data = JSON.parse(json) as { webPage?: { body?: { content?: string }[] } }
  return (data.webPage?.body ?? []).map((s) => s.content ?? '').join('\n')
}

type UuJob = { header?: string; href?: string; location?: string }

/**
 * The openings list: a JobAdvertisement component carries them as JSON in its data attribute,
 * one entry per place, so a role open in two towns comes twice under one link.
 */
export function parseUuJobs(json: string, company: string): CareerPosting[] {
  const m = uuMarkup(json).match(/JobAdvertisement\b[^>]*?\bdata="<uu5json\/>(\[[\s\S]*?\])"/)
  if (!m) throw new Error(`${company}: no job list on the page`)
  const jobs = JSON.parse(m[1].replace(/\\(["\\])/g, '$1')) as UuJob[]
  // Places a role is open in, joined, so the commute filter sees Hradec Králové even when the
  // first entry is Praha.
  const byUrl = new Map<string, CareerPosting>()
  for (const j of jobs) {
    if (!j.href || !j.header) continue
    const had = byUrl.get(j.href)
    if (had) {
      const place = j.location?.trim()
      if (place && !had.location?.includes(place)) had.location = had.location ? `${had.location}, ${place}` : place
      continue
    }
    byUrl.set(j.href, { url: j.href, title: j.header.trim(), company, location: j.location?.trim() || null, remote: false })
  }
  return [...byUrl.values()]
}

/** A posting page as plain text: component markup, inline styles and the reply form dropped. */
export function uuPostingText(json: string): string {
  const text = uuMarkup(json)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    // Style props are JSON inside an attribute, braces and all; they would survive tag stripping.
    .replace(/<uu5json\/>\{[^{}]*\}/g, '')
    .replace(/<uu5string\s*\/>/g, '')
    .replace(/<br\s*\/?>|<\/(UU5\.Bricks\.P|UU5\.Bricks\.Li|Uu5Elements\.Text|p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\+n/g, '\n')
    .replace(/\\+"/g, '"')
    .replace(/"\/>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  // Everything after the apply button is the form and its field lists.
  const form = text.indexOf('\nMám zájem')
  return form > 0 ? text.slice(0, form) : text
}
