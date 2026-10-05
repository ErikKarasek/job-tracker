// Employers with their own site on Jobs.cz (csg.jobs.cz, rb.jobs.cz, …): www.jobs.cz/rpd/<id>/
// redirects there, and the page that comes back is a shell reading "Načítání…". The posting is
// loaded by Alma Career's career widget from a public GraphQL endpoint, with a widget id and key
// that sit in the site's own script bundle, the same ones every visitor's browser uses. Read that
// way, the posting needs no browser. Before this, about 40 % of the inbox was "Not scored".
// Import-free, so the unit tests load it as is; tools.ts turns the HTML it returns into text.

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerAgent/1.0)', 'Accept-Language': 'cs,en;q=0.8' }
const API = 'https://api.capybara.lmc.cz/api/graphql/widget'
// Only what the scorer reads. isNotLoggableToSessionLog keeps the read out of the employer's
// visit statistics.
const QUERY = `query ($widgetId: ID!, $jobAdId: ID!) {
  widget(id: $widgetId, isNotLoggableToSessionLog: true) {
    jobAd(id: $jobAdId, isNotLoggableToSessionLog: true) { title content { htmlContent } }
  }
}`

/** The posting id when `url` (after redirects) is a posting on an employer's Jobs.cz site. */
export function jobsWidgetAdId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!u.hostname.endsWith('.jobs.cz') || u.hostname === 'www.jobs.cz' || !u.pathname.includes('detail-pozice')) return null
  return u.searchParams.get('id')
}

/** The script that loads the site's bundle: `<script src="/assets/js/react.min.js?av=…" id="react-chunks">`. */
export function chunkLoaderPath(html: string): string | null {
  return html.match(/<script\b[^>]*\bsrc="([^"]*react\.min\.js[^"]*)"[^>]*\bid="react-chunks"/)?.[1] ?? null
}

/** The loader lists the bundle's chunks by name; each is fetched from the loader's own path. */
export function chunkNames(loader: string): string[] {
  return [...new Set(loader.match(/react\.[0-9a-f]+\.react\.min\.js/g) ?? [])]
}

/** The site config in one of the chunks: `"widgets":{"main":{"id":"…","apiKey":"…",…}}`. */
export function widgetConfig(js: string): { id: string; apiKey: string } | null {
  const at = js.indexOf('"widgets":{')
  if (at < 0) return null
  const near = js.slice(at, at + 600)
  const id = near.match(/"id":"([0-9a-f-]{36})"/)?.[1]
  const apiKey = near.match(/"apiKey":"([0-9a-f]{32,})"/)?.[1]
  return id && apiKey ? { id, apiKey } : null
}

async function get(url: string) {
  const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  return res.text()
}

/**
 * The posting as `<h1>title</h1>` + its HTML, or null when `url` is not such a site or the widget
 * cannot be found. `html` is the shell page already fetched from `url`.
 */
export async function jobsWidgetPosting(url: string, html: string): Promise<string | null> {
  const jobAdId = jobsWidgetAdId(url)
  const loaderPath = jobAdId ? chunkLoaderPath(html) : null
  if (!jobAdId || !loaderPath) return null
  const loaderUrl = new URL(loaderPath, url)
  let config: { id: string; apiKey: string } | null = null
  // The config has been in the first chunk; the rest are tried in case the order changes.
  for (const name of chunkNames(await get(loaderUrl.toString()))) {
    config = widgetConfig(await get(loaderUrl.toString().replace('react.min.js', name)))
    if (config) break
  }
  if (!config) return null
  const res = await fetch(API, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', 'X-API-KEY': config.apiKey },
    body: JSON.stringify({ query: QUERY, variables: { widgetId: config.id, jobAdId } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: { widget?: { jobAd?: { title?: string; content?: { htmlContent?: string } } } } }
  const ad = data.data?.widget?.jobAd
  if (!ad?.content?.htmlContent) return null
  return `<h1>${ad.title ?? ''}</h1>\n${ad.content.htmlContent}`
}
