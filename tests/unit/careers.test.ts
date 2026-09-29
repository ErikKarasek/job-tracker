// Careers pages read without a browser: links under a prefix, links inside one class, and uu5
// pages through their JSON. Run with: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAREER_PAGES, parseCareerLinks, parseUuJobs, uuPostingText } from '../../server/scout/careers.ts'

const page = (key: string) => CAREER_PAGES.find((p) => p.key === key)!

test('prefix pages keep links one level under the prefix only', () => {
  const html = `
    <a href="/pozice/tester/">Tester software</a>
    <a href="/pozice/">Všechny pozice</a>
    <a href="/pozice/page/2/">Další</a>
    <a href="/pozice/tester/detail/">Detail</a>
    <a href="/kontakt/">Kontakt s námi</a>`
  const found = parseCareerLinks(html, page('stapro') as never)
  assert.deepEqual(found.map((f) => f.url), ['https://www.stapro.cz/pozice/tester/'])
  assert.equal(found[0].title, 'Tester software')
})

test('ELDIS postings are the links inside blog-title, wherever they point', () => {
  const html = `
    <a href="/kariera">Kariéra</a>
    <div class="blog-title"><a href="/sw-tester">SW tester</a></div>
    <div class="blog-title"><a href="/mechanik">Mechanik</a></div>
    <div class="blog-title"><a href="/sw-tester">SW tester</a></div>`
  const found = parseCareerLinks(html, page('eldis') as never)
  assert.deepEqual(
    found.map((f) => [f.url, f.title, f.company]),
    [
      ['https://www.eldis.cz/sw-tester', 'SW tester', 'ELDIS Pardubice, s.r.o'],
      ['https://www.eldis.cz/mechanik', 'Mechanik', 'ELDIS Pardubice, s.r.o'],
    ],
  )
})

// What loadWebPage returns: the job list is JSON inside a component attribute, quotes escaped.
const uuList = (jobs: object[]) =>
  JSON.stringify({
    webPage: {
      body: [
        { content: '<uu5string/><UU5.Bricks.Header>Volné pozice</UU5.Bricks.Header>' },
        {
          content: `<uu5string/><Dap.Bricks.JobAdvertisement colorSchema="default" data="<uu5json/>${JSON.stringify(jobs).replace(/"/g, '\\"')}"/>`,
        },
      ],
    },
  })

test('uu5 job list: one posting per link, its places joined', () => {
  const json = uuList([
    { header: 'Junior Tester', location: 'Hradec Králové', href: 'https://spolu-pracujeme.cz/junior-tester', description: '<b>"quoted"</b>' },
    { header: '.NET Developer', location: 'Praha', href: 'https://spolu-pracujeme.cz/net-developer' },
    { header: '.NET Developer', location: 'Pardubice', href: 'https://spolu-pracujeme.cz/net-developer' },
  ])
  assert.deepEqual(parseUuJobs(json, 'Unicorn'), [
    { url: 'https://spolu-pracujeme.cz/junior-tester', title: 'Junior Tester', company: 'Unicorn', location: 'Hradec Králové', remote: false },
    { url: 'https://spolu-pracujeme.cz/net-developer', title: '.NET Developer', company: 'Unicorn', location: 'Praha, Pardubice', remote: false },
  ])
})

test('a uu5 page without a job list is an error, not an empty day', () => {
  assert.throws(() => parseUuJobs(JSON.stringify({ webPage: { body: [{ content: '<p>jiný obsah</p>' }] } }), 'Unicorn'), /no job list/)
})

test('uu5 posting text drops inline styles and the reply form', () => {
  const content =
    '<uu5string/><UU5.Bricks.P style="<uu5json/>{\\"fontSize\\": \\"15px\\"}">Staň se Junior Testerem!</UU5.Bricks.P>' +
    '<style>.x{padding:5px}</style><UU5.Bricks.P>Náplň: <strong>manuální testování</strong></UU5.Bricks.P>' +
    '<UU5.Bricks.P>Mám zájem</UU5.Bricks.P><Form name="formValue.Name"/>'
  const text = uuPostingText(JSON.stringify({ webPage: { body: [{ content }] } }))
  assert.equal(text, 'Staň se Junior Testerem!\nNáplň: manuální testování')
})
