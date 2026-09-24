import { useState } from 'react'
import type { Application } from '../types'
import { STAGE_CONFIG } from './stages'
import { Column } from './Column'
import { CardEditorModal } from './CardEditorModal'
import { useBoardData } from './useBoardData'
import { AgentModal } from '../agent/AgentModal'
import { CvView } from '../cv/CvView'

export function Board({ canEdit }: { canEdit: boolean }) {
  const { applications, loading, error, createApplication, updateApplication, moveApplication, deleteApplication } =
    useBoardData()
  const [editorTarget, setEditorTarget] = useState<Application | 'new' | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [cvFor, setCvFor] = useState<Application | null>(null)

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl text-ink">Job Tracker</h1>
          <p className="text-sm text-mute">{loading ? 'Loading…' : `${applications.length} applications tracked`}</p>
        </div>
        {canEdit && (
        <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAgentOpen(true)}
          className="rounded-md border border-signal/60 px-3 py-2 text-sm font-medium text-signal hover:bg-signal/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          ✨ From a posting
        </button>
        <button
          type="button"
          onClick={() => setEditorTarget('new')}
          className="rounded-md bg-signal px-3 py-2 text-sm font-medium text-signal-ink hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          + New application
        </button>
        </div>
        )}
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
            canEdit={canEdit}
            onEdit={setEditorTarget}
            onMove={moveApplication}
            onCv={setCvFor}
          />
        ))}
      </div>

      <CardEditorModal
        target={editorTarget}
        onClose={() => setEditorTarget(null)}
        onSave={(input, editingId) => (editingId ? updateApplication(editingId, input) : createApplication(input))}
        onDelete={deleteApplication}
      />

      <AgentModal open={agentOpen} onClose={() => setAgentOpen(false)} onSave={createApplication} />
      {cvFor && <CvView application={cvFor} onClose={() => setCvFor(null)} />}
    </div>
  )
}
