// StartupJobs (JSON API) and Profesia (server-drawn list). Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProfesia, parseStartupJobs } from '../../server/scout/boards.ts'

const offer = (over: Record<string, unknown>) => ({
  id: 1,
  name: { cs: 'Junior frontend vývojář' },
  slug: { cs: 'junior-frontend-vyvojar' },
  salary: null,
  seniorities: ['junior'],
  locationPreferences: ['onsite'],
  locations: [{ name: { cs: 'Hradec Králové, Česko' } }],
  company: { name: 'Firma s.r.o.' },
  ...over,
})

test('StartupJobs offers become postings with the offer URL', () => {
  const [p] = parseStartupJobs({ member: [offer({})] })
  assert.equal(p.url, 'https://www.startupjobs.cz/nabidka/1/junior-frontend-vyvojar')
  assert.equal(p.title, 'Junior frontend vývojář')
  assert.equal(p.company, 'Firma s.r.o.')
  assert.equal(p.location, 'Hradec Králové, Česko')
  assert.equal(p.remote, false)
})

test('StartupJobs drops senior-only offers and keeps ones with no level', () => {
  const found = parseStartupJobs({
    member: [
      offer({ id: 1, seniorities: ['senior'] }),
      offer({ id: 2, seniorities: ['medior', 'senior'] }),
      offer({ id: 3, seniorities: [] }),
    ],
  })
  assert.deepEqual(found.map((f) => f.url.split('/')[4]), ['2', '3'])
})

test('StartupJobs: remote preference, several places, salary only as monthly CZK', () => {
  const [a, b] = parseStartupJobs({
    member: [
      offer({
        id: 1,
        locationPreferences: ['hybrid', 'remote'],
        locations: [{ name: { cs: 'Praha, Česko' } }, { name: { cs: 'Pardubice, Česko' } }],
        salary: { min: 5000000, max: 7000000, currency: 'CZK', period: 'month' },
      }),
      offer({ id: 2, locations: [], salary: { min: 300000, max: 400000, currency: 'EUR', period: 'month' } }),
    ],
  })
  assert.equal(a.remote, true)
  assert.equal(a.location, 'Praha, Česko, Pardubice, Česko')
  assert.equal(a.salaryMin, 50000)
  assert.equal(a.salaryMax, 70000)
  assert.equal(b.location, null)
  assert.equal(b.salaryMin, null)
})

test('StartupJobs tolerates an empty or odd answer', () => {
  assert.deepEqual(parseStartupJobs({}), [])
  assert.deepEqual(parseStartupJobs(null), [])
  assert.deepEqual(parseStartupJobs({ member: [{ id: 5 }] }), [])
})

test('Profesia list rows: encoded links, employer, place, remote', () => {
  const html = `
    <ul><li class="list-row" ><h2><a  id="offer5393627" href="&#x2F;prace&#x2F;manpowergroup&#x2F;O5393627&#x3F;search_id&#x3D;b03"><span class='title'>Global IT Security Engineer | HO</span></a></h2><span class='employer'>ManpowerGroup s.r.o.</span><span title="Remote&#x20;work" class='job-location'>Remote work</span></li>
    <li class="list-row" ><h2><a  id="offer1" href="/prace/firma/O1?search_id=x"><span class='title'>IT technik</span></a></h2><span class='employer'>Firma &amp; syn</span><span class='job-location'>Pardubice</span></li>
    <li class="list-row native-agent">no offer here</li>`
  const found = parseProfesia(html)
  assert.equal(found.length, 2)
  assert.equal(found[0].url, 'https://www.profesia.cz/prace/manpowergroup/O5393627')
  assert.equal(found[0].title, 'Global IT Security Engineer | HO')
  assert.equal(found[0].remote, true)
  assert.equal(found[1].company, 'Firma & syn')
  assert.equal(found[1].location, 'Pardubice')
  assert.equal(found[1].remote, false)
})
