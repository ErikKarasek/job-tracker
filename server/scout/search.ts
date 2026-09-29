// Where the scout looks, and how it reads a Jobs.cz results page.
//
// Jobs.cz draws its search results on the server, so a plain fetch sees every card, and its
// robots.txt allows both /prace/ (search) and /rpd/ (postings). StartupJobs and LinkedIn draw
// theirs with JavaScript and cannot be searched this way.

// Jobs.cz's own IT fields rather than keyword searches: full-text search for "service desk" or
// "QA" mostly found call centres and factory quality control, while these three hold only IT
// work. Between them they cover testing, support and admin, analysis and junior development.
export const SOURCES = [
  { key: 'dev', label: 'IT: vývoj aplikací', slug: 'is-it-vyvoj-aplikaci-a-systemu' },
  { key: 'admin', label: 'IT: správa systémů a HW', slug: 'is-it-sprava-systemu-a-hw' },
  { key: 'analysis', label: 'IT: konzultace a analýzy', slug: 'is-it-konzultace-analyzy-a-projektove-rizeni' },
] as const
export type Source = (typeof SOURCES)[number]

export type Place = 'hk' | 'remote'
export const PLACES: Place[] = ['hk', 'remote']

/** A results page never holds more than this; a shorter one is the last. */
export const PAGE_SIZE = 30
export const MAX_PAGES = 4

// Hradec Králové with the site's own 50 km radius, which takes in Pardubice too. Remote is the
// whole country filtered to "mostly from home", the site's own filter.
export function searchUrl(source: Source, place: Place, page: number) {
  const base =
    place === 'hk'
      ? `https://www.jobs.cz/prace/hradec-kralove/${source.slug}/?`
      : `https://www.jobs.cz/prace/${source.slug}/?arrangement=work-mostly-from-home&`
  return `${base}page=${page}`
}

export type Found = { url: string; title: string; company: string | null; location: string | null; remote: boolean }

// A junior would not get these, and each would cost an agent run to find that out.
// \b in a JS regex only knows ASCII letters, so it never matched after the í of "vedoucí";
// letter lookarounds with the u flag do. "manaž" stays a prefix (manažer, manažerka).
const TOO_SENIOR = /(?<!\p{L})(senior|sr\.|lead|head|vedouc[ií]|manaž\p{L}*|manager|architekt|principal|expert)(?!\p{L})/iu
// Even the IT fields carry some work that is not software: factory quality, sales, purchasing.
// Dropped before any agent run is spent on them, unless the title is plainly IT work anyway
// ("Inženýr SW kvality", "Junior ERP specialista pro výrobu").
const OFF_TOPIC = /(kvalit|výrob|strojír|stavb|účetn|obchodn|obchodník|pokladn|mistr|montáž|řidič|skladn|údržb|prodej|nákup|procurement)/i
const PLAINLY_IT = /(\bSW\b|software|\bIT\b|\bIS\b|ICT|ERP|SAP|junior|tester|vývojář|programátor|developer)/i
// What Erik is after, in order (set by him on 2026-09-26): AI automation and agents first; then
// junior development and implementing information systems; then IT support, technician and admin
// roles along with any other IT. Testing and analyst roles he no longer wants, but they stay as a
// fallback, scored last. The queue is ordered by these priorities (3, 2, 1, 0).
// Not a bare "agent": "Support Agent" and "Service Desk Agent" are helpdesk titles. An AI agent
// role says AI anyway, or "agentic" / "agentní".
const AI_WORK = /(\bAI\b|umělá inteligence|umělou inteligenc|artificial intelligence|machine learning|\bML\b|\bLLM|\bGPT|automatiza|automation|\bRPA\b|n8n|zapier|make\.com|chatbot|agentic|agentn[ií])/i
// Development and implementing information systems: what he wants right after AI work.
const DEV =
  /(frontend|front-end|backend|full.?stack|react|javascript|typescript|node\.?js|programátor|vývojář|developer|\bweb|implement|konzultant|consultant|zavádění|\bERP\b|\bSAP\b)/i
// Support, technician and administration roles: wanted, but he gets most of them (his L1 job
// fits them well, so they score high) and asked on 2026-09-29 to see fewer, so they queue after
// development.
const SUPPORT =
  /(helpdesk|help desk|service desk|support|podpor|technik|technician|specialist|správce|správa|administrátor|admin\b|\bL1\b|\bL2\b)/i
const WANTED = new RegExp(`${DEV.source}|${SUPPORT.source}`, 'i')
const FALLBACK = /(tester|testov|\bQA\b|quality assurance|quality engineer|test engineer|selenium|analytik|analyst|analytič)/i
const REMOTE_TAG = /(převážně|plně) z domova/i

/** The result cards on one Jobs.cz search page. */
export function parseResults(html: string, place: Place): Found[] {
  const found: Found[] = []
  for (const card of html.split('<article').slice(1)) {
    if (!card.includes('SearchResultCard')) continue
    const id = card.match(/https:\/\/www\.jobs\.cz\/rpd\/(\d+)\//)?.[1]
    const title = decode(card.match(/data-test-ad-title="([^"]+)"/)?.[1])
    if (!id || !title) continue
    // The footer items carry an icon <svg> before their text, so match past it.
    const company = decode(card.match(/<span translate="no">([^<]+)<\/span>/)?.[1])
    const location = decode(card.match(/data-test="serp-locality"[\s\S]*?>(?:\s*<svg[\s\S]*?<\/svg>)?([^<]+)</)?.[1])
    const remote = place === 'remote' || REMOTE_TAG.test(card)
    found.push({ url: `https://www.jobs.cz/rpd/${id}/`, title, company, location, remote })
  }
  return found
}

/** Whether a posting is worth an agent run, and how soon. */
export function triage(title: string): { skip: boolean; priority: number } {
  if (TOO_SENIOR.test(title)) return { skip: true, priority: 0 }
  if (OFF_TOPIC.test(title) && !PLAINLY_IT.test(title)) return { skip: true, priority: 0 }
  const wanted = WANTED.test(title)
  // A testing or analyst title is a fallback, unless it also names wanted work
  // ("Programátor / analytik" still counts as development, just below the pure ones).
  if (FALLBACK.test(title)) return { skip: false, priority: wanted ? 1 : 0 }
  if (AI_WORK.test(title)) return { skip: false, priority: 3 }
  if (DEV.test(title)) return { skip: false, priority: 2 }
  // Support and admin next to "other IT": after development, before testing and analysis.
  return { skip: false, priority: 1 }
}

function decode(s: string | undefined) {
  if (!s) return null
  const out = s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return out || null
}
