// Job boards besides Jobs.cz, added 2026-11-25 because Jobs.cz alone turned up about five new
// postings a day, most of them already seen. Import-free, so the unit tests load it as is.
//
// - StartupJobs.cz draws its pages with JavaScript, but they are filled from a public JSON API
//   (back.startupjobs.cz, robots.txt allows all). One POST with the two IT fields returns every
//   offer in the country, ~120; the place filter is commute.ts, as for every other source.
// - Profesia.cz draws its lists on the server. Its IT category per region is small (a handful
//   each, mostly remote), but it is a different pool from Jobs.cz.
//
// LinkedIn and Indeed are left out: both refuse automated fetches (Indeed answers 403).
// Prace.cz runs on the same listings as Jobs.cz, so it would add nothing.

export type BoardPosting = {
  url: string
  title: string
  company: string | null
  location: string | null
  remote: boolean
  salaryMin?: number | null
  salaryMax?: number | null
}

export const BOARDS = [
  { key: 'startupjobs', label: 'StartupJobs' },
  { key: 'profesia-hk', label: 'Profesia: Královéhradecký kraj', list: 'https://www.profesia.cz/prace/kralovehradecky-kraj/informacni-technologie/' },
  { key: 'profesia-pa', label: 'Profesia: Pardubický kraj', list: 'https://www.profesia.cz/prace/pardubicky-kraj/informacni-technologie/' },
] as const
export type Board = (typeof BOARDS)[number]

const SJ_PAGE = 100
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerScout/1.0)', 'Accept-Language': 'cs' }

export async function fetchBoard(board: Board): Promise<BoardPosting[]> {
  if (board.key === 'startupjobs') {
    // 100 a page is the API's ceiling (more answers 422); three pages cover the ~120 offers.
    const found: BoardPosting[] = []
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://back.startupjobs.cz/api/search-offers?itemsPerPage=${SJ_PAGE}&page=${page}`, {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/ld+json', Accept: 'application/ld+json' },
        // Top-level field slugs: "Vývoj" and "Technologické pozice" (support, admin, analysis).
        body: JSON.stringify({ fields: ['vyvoj', 'technologicke-pozice'] }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`StartupJobs answered HTTP ${res.status}`)
      const data = (await res.json()) as { member?: unknown[] }
      found.push(...parseStartupJobs(data))
      if ((data.member?.length ?? 0) < SJ_PAGE) break
    }
    return found
  }
  const res = await fetch(board.list, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${board.label} answered HTTP ${res.status}`)
  return parseProfesia(await res.text())
}

type SjOffer = {
  id: number
  name?: { cs?: string; en?: string }
  slug?: { cs?: string; en?: string }
  salary?: { min?: number; max?: number; currency?: string; period?: string } | null
  seniorities?: string[]
  locationPreferences?: string[]
  locations?: { name?: { cs?: string; en?: string } }[]
  company?: { name?: string }
}

/** StartupJobs search results. Senior-only offers are dropped here: the board says so itself. */
export function parseStartupJobs(data: unknown): BoardPosting[] {
  const members = (data as { member?: SjOffer[] })?.member ?? []
  const found: BoardPosting[] = []
  for (const o of members) {
    const title = (o.name?.cs ?? o.name?.en ?? '').trim()
    const slug = o.slug?.cs ?? o.slug?.en
    if (!o.id || !title || !slug) continue
    const levels = o.seniorities ?? []
    if (levels.length > 0 && !levels.includes('junior') && !levels.includes('medior')) continue
    const places = (o.locations ?? []).map((l) => l.name?.cs ?? l.name?.en).filter(Boolean)
    // Salaries come in hundredths; only a monthly CZK figure is comparable with the other sources.
    const s = o.salary
    const czkMonth = s && s.currency === 'CZK' && s.period === 'month'
    found.push({
      url: `https://www.startupjobs.cz/nabidka/${o.id}/${slug}`,
      title,
      company: o.company?.name?.trim() || null,
      location: places.length ? places.join(', ') : null,
      remote: (o.locationPreferences ?? []).includes('remote'),
      salaryMin: czkMonth && s.min ? Math.round(s.min / 100) : null,
      salaryMax: czkMonth && s.max ? Math.round(s.max / 100) : null,
    })
  }
  return found
}

const REMOTE_PLACE = /remote|z domova|z domu|home ?office/i

/** A Profesia.cz list page: one <li class="list-row"> per offer. */
export function parseProfesia(html: string): BoardPosting[] {
  const found: BoardPosting[] = []
  for (const row of html.split('<li class="list-row"').slice(1)) {
    const link = row.match(/<h2>\s*<a[^>]*href="([^"]*?O\d+)[^"]*"[^>]*>\s*<span class='title'>([^<]+)<\/span>/)
    if (!link) continue
    const path = decode(link[1])
    const title = decode(link[2])
    if (!path || !title) continue
    const company = decode(row.match(/<span class='employer'>([^<]+)<\/span>/)?.[1])
    const location = decode(row.match(/class='job-location'>([^<]+)<\/span>/)?.[1])
    found.push({
      url: new URL(path, 'https://www.profesia.cz').toString(),
      title,
      company,
      location,
      remote: REMOTE_PLACE.test(location ?? ''),
    })
  }
  return found
}

function decode(s: string | undefined) {
  if (!s) return null
  const out = s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return out || null
}
