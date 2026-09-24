// Where the scout looks, and how it reads a Jobs.cz results page.
//
// Jobs.cz draws its search results on the server, so a plain fetch sees every card, and its
// robots.txt allows both /prace/ (search) and /rpd/ (postings). StartupJobs and LinkedIn draw
// theirs with JavaScript and cannot be searched this way.

/** What Erik can do today: testing and QA, junior frontend, first-line IT support. */
// Not "QA": on Jobs.cz that is mostly quality control in factories, not software testing.
export const QUERIES = ['tester', 'test analytik', 'junior frontend', 'junior react', 'IT support', 'helpdesk']

export type Place = 'hk' | 'remote'

// Hradec Králové with the site's own 50 km radius, which takes in Pardubice too. Remote has no
// search filter of its own: the scout searches the whole country and keeps only cards tagged as
// mostly or fully from home.
export const PLACES: Record<Place, string> = {
  hk: 'https://www.jobs.cz/prace/hradec-kralove/',
  remote: 'https://www.jobs.cz/prace/',
}

export function searchUrl(query: string, place: Place) {
  return `${PLACES[place]}?q%5B%5D=${encodeURIComponent(query)}`
}

export type Found = { url: string; title: string; company: string | null; location: string | null; remote: boolean }

// A junior would not get these, and each would cost an agent run to find that out.
const TOO_SENIOR = /\b(senior|sr\.|lead|head|vedouc[ií]|manaž|manager|architekt|principal|expert)\b/i
// Full-text search pulls in plenty that is not software work at all: "IT support" finds
// cashiers and accountants, "tester" finds factory quality control. Dropped before any agent
// run is spent on them.
const OFF_TOPIC = /(kvalit|výrob|stroj|stavb|účetn|obchodn|pokladn|mistr|montáž|řidič|skladn|prodej|nákup|procurement)/i
// Titles that name the work Erik is after go to the front of the queue.
const CORE = /(tester|testov|test engineer|\bQA\b|junior|frontend|front-end|react|helpdesk|help desk|IT support|technick[áé] podpor|podpor[ay] IT|ICT|IT techni|správce)/i
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
    const remote = REMOTE_TAG.test(card)
    if (place === 'remote' && !remote) continue
    found.push({ url: `https://www.jobs.cz/rpd/${id}/`, title, company, location, remote })
  }
  return found
}

/** Whether a posting is worth an agent run, and how soon. */
export function triage(title: string): { skip: boolean; priority: number } {
  if (TOO_SENIOR.test(title) || OFF_TOPIC.test(title)) return { skip: true, priority: 0 }
  return { skip: false, priority: CORE.test(title) ? 2 : 1 }
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
