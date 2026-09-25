// The third source: careers pages of IT employers around Hradec Králové and Pardubice, read
// directly. Some post there first or only there. Each entry names the page that lists openings
// and the URL prefix its postings live under; a page drawn with JavaScript lists nothing and is
// left out (ELDIS, Unicorn and ČEZ were, when checked on 2026-09-25).
//
// The company names match how Jobs.cz writes them, so a role posted in both places is suggested
// once (insertFound folds duplicates by title and company).
export const CAREER_PAGES = [
  { key: 'stapro', company: 'STAPRO s. r. o.', list: 'https://www.stapro.cz/kariera/', prefix: 'https://www.stapro.cz/pozice/' },
  { key: 'retia', company: 'RETIA, a.s.', list: 'https://www.mametenaradaru.cz/volne-pozice/', prefix: 'https://www.mametenaradaru.cz/volne-pozice/' },
] as const
export type CareerPage = (typeof CAREER_PAGES)[number]

export async function fetchCareerPage(page: CareerPage) {
  const res = await fetch(page.list, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerScout/1.0)', 'Accept-Language': 'cs' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`${page.company} careers page answered HTTP ${res.status}`)
  const html = await res.text()
  const seen = new Set<string>()
  const found: { url: string; title: string; company: string; location: null; remote: false }[] = []
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string
    try {
      url = new URL(m[1].replace(/&amp;/g, '&'), page.list).toString()
    } catch {
      continue
    }
    // A posting sits one level under the prefix; the list itself and its pagination do not count.
    const rest = url.startsWith(page.prefix) ? url.slice(page.prefix.length).replace(/\/$/, '') : ''
    if (!rest || rest.includes('/') || rest.startsWith('page') || seen.has(url)) continue
    const title = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (title.length < 4) continue
    seen.add(url)
    found.push({ url, title, company: page.company, location: null, remote: false })
  }
  return found
}
