import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Application } from '../types'
import { api, type CvResponse } from '../lib/api-client'

// The same look as the general résumé PDFs on erikkarasek.cz (spidey-portfolio/scripts/
// build-cv.mjs), drawn in the browser so "Save as PDF" in the print dialog makes the file. Chrome
// keeps the links clickable in the PDF it writes.
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
  font: 500 9.4pt/1.38 Outfit, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.cv-sheet * { box-sizing: border-box; margin: 0; padding: 0 }
.cv-sheet header { display: flex; align-items: center; gap: 9mm; padding-bottom: 6mm; border-bottom: 2px solid #a31515 }
.cv-sheet .photo { width: 34mm; height: 34mm; border-radius: 50%; border: 1.6mm solid #a31515; padding: 1mm; background: #fff; flex: none; box-shadow: 0 0 6mm rgba(163,21,21,.25) }
.cv-sheet .photo img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block }
.cv-sheet .qr { margin-left: auto; flex: none; text-align: center; font-size: 7pt; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #a31515 }
.cv-sheet .qr a { display: block; font-size: 8pt; letter-spacing: .02em; text-transform: none }
/* The red shadow is an image rendered by the portfolio's build-cv.mjs, not a CSS text-shadow:
   Chrome writes text-shadow into the PDF as extra copies of the name, and a résumé parser then
   reads "ERIKKARÁSEK. ERIKKARÁSEK. ERIKKARÁSEK.". Same box as there, so the image lines up. */
.cv-sheet h1 { display: inline-block; padding: 0 3pt 3pt 0; margin-bottom: -3pt; font-size: 30pt; line-height: .95; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -.03em; color: #111827;
  background: url(https://erikkarasek.cz/img/cv-name-shadow.png) no-repeat 0 0 / 100% 100% }
.cv-sheet .title { margin-top: 2.5mm; font-size: 10pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #a31515 }
.cv-sheet .contact { margin-top: 2.5mm; font-size: 8.6pt; color: #4b5563; font-weight: 600 }
.cv-sheet a { color: inherit; text-decoration: none }
.cv-sheet .contact i { font-style: normal; color: #a31515; margin: 0 1.6mm }
.cv-sheet .cols { display: grid; grid-template-columns: 1fr 62mm; gap: 8mm; margin-top: 6mm }
.cv-sheet h2 { display: flex; align-items: center; gap: 2mm; font-size: 8.6pt; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; color: #a31515; margin: 4.2mm 0 2.2mm }
.cv-sheet h2 span { width: 3mm; height: 2.2mm; background: #a31515; border-radius: .4mm }
.cv-sheet section:first-child h2 { margin-top: 0 }
.cv-sheet h2 { break-after: avoid }
.cv-sheet .profile { color: #374151 }
.cv-sheet .item { margin-bottom: 3mm; break-inside: avoid }
.cv-sheet .row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm }
.cv-sheet .role { font-weight: 900; font-size: 10.2pt; text-transform: uppercase; letter-spacing: -.01em; color: #111827 }
.cv-sheet .when { font-size: 8pt; font-weight: 700; color: #a31515; white-space: nowrap }
.cv-sheet .where { font-size: 8.4pt; color: #6b7280; font-weight: 600; margin: .3mm 0 1.2mm }
.cv-sheet ul { padding-left: 3.6mm } .cv-sheet li { margin: .5mm 0 } .cv-sheet li::marker { color: #a31515 }
.cv-sheet aside { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 3mm; padding: 5mm 4.5mm; align-self: start }
.cv-sheet aside h2 { letter-spacing: .16em }
.cv-sheet .pair { break-inside: avoid }
.cv-sheet .chips { display: flex; flex-wrap: wrap; gap: 1.4mm }
.cv-sheet .chips b { font-size: 7.8pt; font-weight: 700; color: #a31515; background: #fff; border: 1px solid rgba(163,21,21,.3); border-radius: 1.6mm; padding: .7mm 2mm }
.cv-sheet dt { font-weight: 800; color: #111827; font-size: 8.8pt } .cv-sheet dd { color: #4b5563; font-size: 8.4pt; margin-bottom: 1.8mm }
.cv-sheet .edu { margin-bottom: 2.4mm } .cv-sheet .edu b { display: block; font-size: 8.8pt; color: #111827 } .cv-sheet .edu span { display: block; font-size: 8.2pt; color: #6b7280 }
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
      <div className="cols">
        <main>
          <section>
            {head(d.labels.profile)}
            <p className="profile" contentEditable suppressContentEditableWarning>
              {t.profile}
            </p>
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
            {head(d.labels.projects)}
            {projects.map((p) => (
              <div className="item" key={p.name}>
                <div className="row">
                  <span className="role">{p.name}</span>
                  <span className="when">{p.when}</span>
                </div>
                <p className="where">
                  <a href={url(p.link)}>{p.link}</a>
                  {p.study && (
                    <>
                      {' '}
                      <b>·</b> {d.studyLabel}: <a href={url(p.study)}>{p.study}</a>
                    </>
                  )}
                </p>
                {list(p.points)}
              </div>
            ))}
          </section>
        </main>
        <aside>
          <section>
            {head(d.labels.tech)}
            <div className="chips">
              {tech.map((x) => (
                <b key={x}>{x}</b>
              ))}
            </div>
          </section>
          <section>
            {head(d.labels.strengths)}
            <dl>
              {d.strengths.map(([k, v]) => (
                <div className="pair" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            {head(d.labels.skills)}
            <dl>
              {skills.map(([k, v]) => (
                <div className="pair" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            {head(d.labels.education)}
            {d.education.map((e) => (
              <div className="edu pair" key={e.what}>
                <b>{e.what}</b>
                <span>{e.where}</span>
                <span>{e.when}</span>
              </div>
            ))}
          </section>
          <section>
            {head(d.labels.other)}
            <dl>
              {d.other.map(([k, v]) => (
                <div className="pair" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </article>
  )
}
