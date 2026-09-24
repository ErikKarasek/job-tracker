import type { Application, Stage } from '../types'
import { stageConfig } from './stages'
import { Card } from './Card'

interface ColumnProps {
  stage: Stage
  applications: Application[]
  canEdit: boolean
  onEdit: (application: Application) => void
  onMove: (id: string, stage: Stage) => void
  onCv: (application: Application) => void
}

export function Column({ stage, applications, canEdit, onEdit, onMove, onCv }: ColumnProps) {
  const config = stageConfig(stage)

  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl border border-line-soft bg-surface">
      <header className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: config.accentVar }} />
        <h2 className="font-semibold text-ink">{config.label}</h2>
        <span className="ml-auto font-mono text-xs text-mute">{applications.length}</span>
      </header>
      <ul className="flex flex-1 flex-col gap-2 p-2.5">
        {applications.length === 0 && <p className="px-1 py-4 text-center text-xs text-mute">{config.description}</p>}
        {applications.map((application) => (
          <Card key={application.id} application={application} canEdit={canEdit} onEdit={onEdit} onMove={onMove} onCv={onCv} />
        ))}
      </ul>
    </section>
  )
}
