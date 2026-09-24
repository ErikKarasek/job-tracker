import type { Application, Stage } from '../types'
import { STAGE_CONFIG } from './stages'
import { formatSalary } from '../lib/dates'
import { StaleBadge } from './StaleBadge'

interface CardProps {
  application: Application
  canEdit: boolean
  onEdit: (application: Application) => void
  onMove: (id: string, stage: Stage) => void
  onCv: (application: Application) => void
}

export function Card({ application, canEdit, onEdit, onMove, onCv }: CardProps) {
  const salary = formatSalary(application.salaryMin, application.salaryMax)

  return (
    <li className="rounded-lg border border-line bg-surface-2 p-3 shadow-sm shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{application.role}</p>
          <p className="truncate text-sm text-ink-2">{application.company}</p>
        </div>
        {canEdit && (
        <div className="flex shrink-0 gap-1">
        {application.jobUrl && (
          <button
            type="button"
            onClick={() => onCv(application)}
            title="A CV fitted to this posting"
            className="rounded-md border border-signal/50 px-2 py-1 text-xs text-signal hover:bg-signal/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
          >
            CV
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(application)}
          className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-mute hover:border-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          Edit
        </button>
        </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-mute">
        {application.location && <span>{application.location}</span>}
        {salary && <span>{salary}</span>}
        {application.source && <span>{application.source}</span>}
        {application.fitScore != null && (
          <span title={application.fitSummary ?? undefined} className="text-signal">
            fit {application.fitScore}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <StaleBadge lastActivityAt={application.lastActivityAt} stage={application.stage} />
        {canEdit && (
        <label className="ml-auto flex items-center gap-1.5 text-xs text-mute">
          <span className="sr-only">Move {application.role} at {application.company} to a different stage</span>
          Move to
          <select
            value={application.stage}
            onChange={(e) => onMove(application.id, e.target.value as Stage)}
            className="rounded-md border border-line bg-surface px-1.5 py-1 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
          >
            {STAGE_CONFIG.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        )}
      </div>
    </li>
  )
}
