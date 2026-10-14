import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Application } from '../types'
import { api, type CvResponse } from '../lib/api-client'

// The same look as the general résumé PDFs on erikkarasek.cz (spidey-portfolio/scripts/
// build-cv.mjs), drawn in the browser so "Save as PDF" in the print dialog makes the file. Chrome
// keeps the links clickable in the PDF it writes.
//
// One column, section by section, like the build on the portfolio. This sheet used to put tech,
// strengths, skills and education in a sidebar, which looked good on screen and broke automated
// screening: in the PDF's text a role ended up next to whatever sat beside it, so a parser paired
// "Analytik / Tester" with the *next* job's employer. Everything runs top to bottom now, and the
// numbers below are the measured ones from build-cv.mjs, where the pitfalls are written out in full:
// no negative letter-spacing anywhere (Chrome then drops the spaces from the PDF and a parser reads
// "ICTTECHNIKL1"), and the space glyph borrowed from Arial.
const SHEET_CSS = `
@page { size: A4; margin: 12mm 13mm 11mm }
@media print {
  /* The CV is portalled next to the app's root, so hiding the root leaves only the CV. */
  #root { display: none !important }
  html, body { background: #fff !important }
  .cv-overlay { position: static !important; overflow: visible !important; background: none !important }
  .cv-sheet { width: auto; min-height: 0; box-shadow: none !important; margin: 0 !important; padding: 1mm 1mm 0 !important }
  .cv-sheet [contenteditable] { outline: none !important }
}
.cv-sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 13mm 14mm; background: #fff; color: #1f2937; box-shadow: 0 10px 40px rgba(0,0,0,.4);
  font: 500 9.1pt/1.32 SpaceFromArial, Outfit, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
/* Chrome writes Outfit's text without space glyphs, so parsers guess word breaks from the gaps and
   a narrow one read "Juniorvývojář,kterýstaví…". The space alone comes from Arial, which Chrome does
   write; same fix as the portfolio's build-cv.mjs. */
@font-face { font-family: SpaceFromArial; src: local('Arial'), local('Helvetica'); unicode-range: U+0020 }
.cv-sheet * { box-sizing: border-box; margin: 0; padding: 0 }
.cv-sheet header { display: flex; align-items: center; gap: 8mm; padding-bottom: 4mm; border-bottom: 2px solid #a31515 }
.cv-sheet .photo { width: 30mm; height: 30mm; border-radius: 50%; border: 1.6mm solid #a31515; padding: 1mm; background: #fff; flex: none; box-shadow: 0 0 6mm rgba(163,21,21,.25) }
.cv-sheet .photo img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block }
.cv-sheet .qr { margin-left: auto; flex: none; text-align: center; font-size: 7pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #a31515 }
.cv-sheet .qr a { display: block; font-size: 8pt; letter-spacing: .02em; text-transform: none }
/* The red shadow is an image rendered by the portfolio's build-cv.mjs, not a CSS text-shadow:
   Chrome writes text-shadow into the PDF as extra copies of the name, and a résumé parser then
   reads "ERIKKARÁSEK. ERIKKARÁSEK. ERIKKARÁSEK.". Same box as there (27pt, no letter-spacing, which
   would drop the space between the names from the PDF), so the image lines up. */
.cv-sheet h1 { font-family: SpaceFromArial, Outfit, sans-serif; display: inline-block; padding: 0 3pt 3pt 0; margin-bottom: -3pt; font-size: 27pt; line-height: .95; font-weight: 900; font-style: italic; text-transform: uppercase; color: #111827;
  background: url(https://erikkarasek.cz/img/cv-name-shadow.png) no-repeat 0 0 / 100% 100% }
.cv-sheet .title { margin-top: 2.2mm; font-size: 9.6pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #a31515 }
.cv-sheet .contact { margin-top: 2.2mm; font-size: 8.6pt; color: #4b5563; font-weight: 600 }
.cv-sheet a { color: inherit; text-decoration: none }
.cv-sheet .contact i { font-style: normal; color: #a31515; margin: 0 1.6mm }
.cv-sheet h2 { display: flex; align-items: center; gap: 2mm; font-size: 8.8pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #a31515; margin: 3mm 0 1.4mm }
.cv-sheet h2 span { width: 3mm; height: 2.2mm; background: #a31515; border-radius: .4mm }
.cv-sheet h2 { break-after: avoid }
.cv-sheet main > section:first-child h2 { margin-top: 3.4mm }
.cv-sheet .profile { color: #374151 }
.cv-sheet .item { margin-bottom: 2mm; break-inside: avoid }
.cv-sheet .row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm }
/* no letter-spacing on .role: a negative value drops the spaces from the PDF, see build-cv.mjs */
.cv-sheet .role { font-weight: 900; font-size: 10pt; text-transform: uppercase; color: #111827 }
.cv-sheet .when { font-size: 8pt; font-weight: 700; color: #a31515; white-space: nowrap }
.cv-sheet .where { font-size: 8.4pt; color: #6b7280; font-weight: 600; margin: .3mm 0 1.2mm }
.cv-sheet ul { padding-left: 3.4mm } .cv-sheet li { margin: .25mm 0 } .cv-sheet li::marker { color: #a31515 }
.cv-sheet .chips { display: flex; flex-wrap: wrap; gap: 1.4mm }
.cv-sheet .chips b { font-size: 7.8pt; font-weight: 700; color: #a31515; background: #fff; border: 1px solid rgba(163,21,21,.3); border-radius: 1.6mm; padding: .7mm 2mm }
.cv-sheet .pair { margin-bottom: .75mm; break-inside: avoid; color: #4b5563; font-size: 8.8pt }
.cv-sheet .pair b { color: #111827; font-weight: 800 }
.cv-sheet .edu { margin-bottom: 1.2mm; break-inside: avoid }
.cv-sheet .edu b { font-size: 9pt; color: #111827 } .cv-sheet .edu span { color: #6b7280; font-size: 8.4pt }
.cv-sheet [contenteditable]:hover, .cv-sheet [contenteditable]:focus { outline: 1px dashed #a31515; outline-offset: 1mm }
`

const FONT = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap'
const url = (v: string) => (/^https?:\/\//.test(v) ? v : `https://${v}`)
// Anything the order does not name keeps its place after the named ones.
const orderBy = <T,>(items: readonly T[], key: (t: T) => string, order: string[]) => {
  const rank = (t: T) => {
    const i = order.indexOf(key(t))
    return i === -1 ? order.length + items.indexOf(t) : i
  }
  return [...items].sort((a, b) => rank(a) - rank(b))
}

export function CvView({ application, onClose }: { application: Application; onClose: () => void }) {
  const [data, setData] = useState<CvResponse | null>(null)
  const [state, setState] = useState<'loading' | 'tailoring' | 'ready' | 'needs-text' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')

  async function tailor(pasted?: string) {
    setState('tailoring')
    setError(null)
    try {
      setData(await api.tailorCv(application.id, pasted))
      setState('ready')
    } catch (err) {
      const e = err as Error & { needsText?: boolean }
      setError(e.message)
      setState(e.needsText ? 'needs-text' : 'error')
    }
  }

  useEffect(() => {
    let cancelled = false
    void api.getCv(application.id).then(
      (r) => {
        if (cancelled) return
        if (r.tailoring) {
          setData(r)
          setState('ready')
        } else void tailor()
      },
      (err: Error) => {
        setError(err.message)
        setState('error')
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id])

  // The print dialog offers the page title as the file name.
  useEffect(() => {
    const before = document.title
    document.title = `Erik-Karasek-CV-${application.company.replace(/[^\p{L}\p{N}]+/gu, '-')}`
    return () => {
      document.title = before
    }
  }, [application.company])

  return createPortal(
    <div className="cv-overlay fixed inset-0 z-50 overflow-y-auto bg-bg/95">
      <link rel="stylesheet" href={FONT} />
      <style>{SHEET_CSS}</style>

      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 p-4 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
            ← Back
          </button>
          <p className="text-sm text-ink">
            CV for <b>{application.role}</b> at {application.company}
          </p>
          {state === 'ready' && (
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => void tailor()} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
                Tailor again
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink hover:brightness-110"
              >
                Save as PDF
              </button>
            </div>
          )}
        </div>
        {state === 'ready' && data?.tailoring && (
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
            {data.tailoring.rationale} <span className="text-mute">Click the headline or the profile to edit them. Check the profile before sending: it was rewritten by a model.</span>
          </p>
        )}
        {(state === 'loading' || state === 'tailoring') && (
          <p className="animate-pulse rounded-md border border-line bg-surface-2 px-3 py-6 text-center text-sm text-mute">
            {state === 'loading' ? 'Loading…' : 'Reading the posting and fitting the CV to it… (5–15 s)'}
          </p>
        )}
        {error && state !== 'needs-text' && (
          <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
            {error}
          </p>
        )}
        {state === 'needs-text' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-2">{error}</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink"
            />
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => void tailor(text)}
              className="self-end rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink disabled:opacity-40"
            >
              Tailor the CV
            </button>
          </div>
        )}
      </div>

      {state === 'ready' && data?.tailoring && <Sheet data={data} />}
      <div className="h-8 print:hidden" />
    </div>,
    document.body,
  )
}

function Sheet({ data }: { data: CvResponse }) {
  const d = data.cv
  const t = data.tailoring!
  const projects = orderBy(d.projects, (p) => p.name, t.projectOrder)
  const skills = orderBy(d.skills, ([name]) => name, t.skillOrder)
  const tech = orderBy(d.tech, (x) => x, t.techOrder)
  const head = (label: string) => (
    <h2>
      <span />
      {label}
    </h2>
  )
  const list = (points: readonly string[]) => (
    <ul>
      {points.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  )
  // One line each, so the PDF's text keeps the label with its own value.
  const pair = ([k, v]: readonly string[]) => (
    <p className="pair" key={k}>
      <b>{k}:</b> {v}
    </p>
  )
  const contact: React.ReactNode[] = [
    data.phone,
    <a href={`mailto:${d.email}`}>{d.email}</a>,
    d.city,
    <a href={url(d.github)}>{d.github}</a>,
    <a href={url(d.web)}>{d.web}</a>,
  ]

  return (
    <article className="cv-sheet">
      <header>
        <div className="photo">
          <img src={d.photo} alt="" />
        </div>
        <div>
          <h1>{d.name}.</h1>
          <p className="title" contentEditable suppressContentEditableWarning>
            {t.title}
          </p>
          <p className="contact">
            {contact.map((c, i) => (
              <span key={i}>
                {i > 0 && <i>·</i>}
                {c}
              </span>
            ))}
          </p>
        </div>
        <div className="qr">
          {d.labels.qr}
          <a href={url(d.web)}>{d.web}</a>
        </div>
      </header>
      <main>
        <section>
          {head(d.labels.profile)}
          <p className="profile" contentEditable suppressContentEditableWarning>
            {t.profile}
          </p>
        </section>
        <section>
          {head(d.labels.tech)}
          <div className="chips">
            {tech.map((x) => (
              <b key={x}>{x}</b>
            ))}
          </div>
        </section>
        <section>
          {head(d.labels.experience)}
          {d.jobs.map((j) => (
            <div className="item" key={j.role + j.when}>
              <div className="row">
                <span className="role">{j.role}</span>
                <span className="when">{j.when}</span>
              </div>
              <p className="where">{j.where}</p>
              {list(j.points)}
            </div>
          ))}
        </section>
        <section>
          {head(d.labels.strengths)}
          {d.strengths.map(pair)}
        </section>
        <section>
          {head(d.labels.projects)}
          {projects.map((p) => (
            <div className="item" key={p.name}>
              <div className="row">
                <span className="role">{p.name}</span>
                <span className="when">{p.when}</span>
              </div>
              <p className="where">
                {p.link && <a href={url(p.link)}>{p.link}</a>}
                {p.study && (
                  <>
                    {p.link && (
                      <>
                        {' '}
                        <b>·</b>{' '}
                      </>
                    )}
                    {d.studyLabel}: <a href={url(p.study)}>{p.study}</a>
                  </>
                )}
              </p>
              {list(p.points)}
            </div>
          ))}
        </section>
        <section>
          {head(d.labels.skills)}
          {skills.map(pair)}
        </section>
        <section>
          {head(d.labels.education)}
          {d.education.map((e) => (
            <div className="edu" key={e.what}>
              <p>
                <b>{e.what}</b>, <span>{e.where}, {e.when}</span>
              </p>
              {e.points && list(e.points)}
            </div>
          ))}
        </section>
        <section>
          {head(d.labels.other)}
          {d.other.map(pair)}
        </section>
      </main>
    </article>
  )
}
