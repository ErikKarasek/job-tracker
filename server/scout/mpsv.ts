// A second source for the scout: vacancies reported to the Czech Labour Office (Úřad práce),
// published as open data by MPSV. It reaches employers that never use Jobs.cz (schools,
// universities, municipalities, small firms), and every vacancy comes as structured data, so it
// is scored from its fields without fetching a page and its salary is a number, not a guess.
//
// The full dataset is 188 MB; the daily increment (new, changed and withdrawn vacancies) is about
// 12 MB, ~2 400 vacancies, of which ~75 are IT work. That is what the scout reads, once a day.
// Terms of use: https://data.mpsv.cz/web/data/podminky-uziti
const INCREMENT = (day: string) => `https://data.mpsv.cz/od/soubory/volna-mista-prirustek/volna-mista-prirustek-${day}.json`
export const DETAIL = (portalId: number) => `https://up.gov.cz/volna-mista-v-cr#/volna-mista-detail/${portalId}`

// CZ-ISCO 251x ICT developers and analysts (2519 is testing), 252x database, network and system
// administration, 351x ICT operations and user support technicians.
const IT_ISCO = /^(251|252|351)/
// RÚIAN region codes: Královéhradecký and Pardubický, the Hradec Králové commute.
const REGIONS: Record<string, string> = { 'Kraj/86': 'Královéhradecký kraj', 'Kraj/94': 'Pardubický kraj' }
const REMOTE_TEXT = /(home.?office|z domova|remote|na dálku)/i

type Loc = { cs?: string } | null
type Vacancy = {
  portalId: number
  pozadovanaProfese?: Loc
  upresnujiciInformace?: Loc
  mesicniMzdaOd?: number | null
  mesicniMzdaDo?: number | null
  profeseCzIsco?: { id?: string } | null
  typZmenyOpenData?: { id?: string } | null
  zverejnovat?: { id?: string } | null
  zamestnavatel?: { nazev?: string } | null
  mistoVykonuPrace?: {
    typMistaVykonuPrace?: { id?: string } | null
    pracoviste?: { adresa?: { kraj?: { id?: string } | null; psc?: string | number | null } | null }[] | null
  } | null
  pozadovanaDovednost?: { popis?: string | null }[] | null
  pozadovanaJazykovaZnalost?: { popis?: string | null; jazyk?: { id?: string } | null }[] | null
  vyhodyVolnehoMista?: { popis?: string | null }[] | null
  pocetHodinTydne?: number | null
}

export type MpsvFound = {
  url: string
  title: string
  company: string | null
  location: string | null
  remote: boolean
  salaryMin: number | null
  salaryMax: number | null
  text: string
}

/** Yesterday's IT vacancies in the region (or anywhere, when they say remote), new or changed. */
export async function fetchMpsv(day: string): Promise<MpsvFound[]> {
  const res = await fetch(INCREMENT(day), { signal: AbortSignal.timeout(30_000) })
  // The file for a day appears in the evening; a missing one just means there is nothing yet.
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`MPSV answered HTTP ${res.status}`)
  const { polozky } = (await res.json()) as { polozky: Vacancy[] }

  const found: MpsvFound[] = []
  for (const v of polozky) {
    const change = v.typZmenyOpenData?.id ?? ''
    if (!/novy|zmeneny/.test(change) || !v.zverejnovat?.id?.endsWith('ano')) continue
    if (!IT_ISCO.test(v.profeseCzIsco?.id?.split('/').pop() ?? '')) continue
    const text = v.upresnujiciInformace?.cs ?? ''
    const region = v.mistoVykonuPrace?.pracoviste?.map((p) => REGIONS[p.adresa?.kraj?.id ?? '']).find(Boolean)
    const anywhere = v.mistoVykonuPrace?.typMistaVykonuPrace?.id?.endsWith('celaCR') ?? false
    const remote = REMOTE_TEXT.test(text)
    if (!region && !remote && !anywhere) continue

    const title = v.pozadovanaProfese?.cs?.trim()
    if (!title) continue
    found.push({
      url: DETAIL(v.portalId),
      title,
      company: v.zamestnavatel?.nazev?.trim() ?? null,
      location: region ?? (anywhere ? 'celá ČR' : null),
      remote,
      salaryMin: v.mesicniMzdaOd ?? null,
      salaryMax: v.mesicniMzdaDo ?? null,
      text: postingText(v, title, region ?? (anywhere ? 'celá ČR' : 'neuvedeno')),
    })
  }
  return found
}

/** The vacancy's fields as a posting the scorer can read, since there is no page to fetch. */
function postingText(v: Vacancy, title: string, where: string) {
  const pay = v.mesicniMzdaOd ? `${v.mesicniMzdaOd}${v.mesicniMzdaDo ? `–${v.mesicniMzdaDo}` : '+'} Kč měsíčně` : 'neuvedena'
  const list = (items: { popis?: string | null }[] | null | undefined) =>
    (items ?? []).map((i) => i.popis?.trim()).filter(Boolean).join('; ')
  return [
    `Pozice: ${title}`,
    `Zaměstnavatel: ${v.zamestnavatel?.nazev ?? 'neuveden'}`,
    `Místo: ${where}`,
    `Mzda: ${pay}`,
    v.pocetHodinTydne ? `Úvazek: ${v.pocetHodinTydne} h týdně` : '',
    v.upresnujiciInformace?.cs ? `Popis: ${v.upresnujiciInformace.cs}` : '',
    list(v.pozadovanaDovednost) ? `Požadované dovednosti: ${list(v.pozadovanaDovednost)}` : '',
    list(v.pozadovanaJazykovaZnalost) ? `Jazyky: ${list(v.pozadovanaJazykovaZnalost)}` : '',
    list(v.vyhodyVolnehoMista) ? `Výhody: ${list(v.vyhodyVolnehoMista)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
