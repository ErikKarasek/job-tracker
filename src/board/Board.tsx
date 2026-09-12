import { useState } from 'react'
import type { Application } from '../types'
import { STAGE_CONFIG } from './stages'
import { Column } from './Column'
import { CardEditorModal } from './CardEditorModal'
import { useBoardData } from './useBoardData'

export function Board() {
  const { applications, loading, error, createApplication, updateApplication, moveApplication, deleteApplication } =
    useBoardData()
  const [editorTarget, setEditorTarget] = useState<Application | 'new' | null>(null)

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl text-ink">Job Tracker</h1>
          <p className="text-sm text-mute">{loading ? 'Loading…' : `${applications.length} applications tracked`}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditorTarget('new')}
          className="rounded-md bg-signal px-3 py-2 text-sm font-medium text-signal-ink hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          + New application
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-stage-rejected/40 bg-stage-rejected/10 px-3 py-2 text-sm text-stage-rejected">
          {error}
        </p>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
        {STAGE_CONFIG.map(({ key }) => (
          <Column
            key={key}
            stage={key}
            applications={applications.filter((a) => a.stage === key)}
            onEdit={setEditorTarget}
            onMove={moveApplication}
          />
        ))}
      </div>

      <CardEditorModal
        target={editorTarget}
        onClose={() => setEditorTarget(null)}
        onSave={(input, editingId) => (editingId ? updateApplication(editingId, input) : createApplication(input))}
        onDelete={deleteApplication}
      />
    </div>
  )
}
