import { useEffect, useRef } from 'react'
import type { Application, ApplicationInput } from '../types'

interface CardEditorModalProps {
  // null = closed. 'new' = create mode. An Application = edit mode.
  target: Application | 'new' | null
  onClose: () => void
  onSave: (input: ApplicationInput, editingId: string | null) => void
  onDelete: (id: string) => void
}

export function CardEditorModal({ target, onClose, onSave, onDelete }: CardEditorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = target !== null && target !== 'new'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (target !== null && !dialog.open) dialog.showModal()
    if (target === null && dialog.open) dialog.close()
  }, [target])

  if (target === null) return null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const num = (key: string) => {
      const v = form.get(key)
      return v && String(v).trim() !== '' ? Number(v) : null
    }
    const str = (key: string) => {
      const v = form.get(key)
      return v && String(v).trim() !== '' ? String(v) : null
    }
    onSave(
      {
        company: String(form.get('company') ?? '').trim(),
        role: String(form.get('role') ?? '').trim(),
        jobUrl: str('jobUrl'),
        location: str('location'),
        salaryMin: num('salaryMin'),
        salaryMax: num('salaryMax'),
        source: str('source'),
        notes: str('notes'),
      },
      isEditing ? target.id : null,
    )
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="card-editor-title"
      className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/60"
    >
      <form method="dialog" onSubmit={handleSubmit} className="flex flex-col gap-3 p-5">
        <h2 id="card-editor-title" className="font-semibold text-lg">
          {isEditing ? 'Edit application' : 'New application'}
        </h2>

        <Field label="Company" name="company" defaultValue={isEditing ? target.company : ''} required />
        <Field label="Role" name="role" defaultValue={isEditing ? target.role : ''} required />
        <Field label="Job posting URL" name="jobUrl" defaultValue={isEditing ? (target.jobUrl ?? '') : ''} type="url" />
        <div className="flex gap-3">
          <Field label="Location" name="location" defaultValue={isEditing ? (target.location ?? '') : ''} className="flex-1" />
          <Field label="Source" name="source" defaultValue={isEditing ? (target.source ?? '') : ''} className="flex-1" />
        </div>
        <div className="flex gap-3">
          <Field
            label="Salary min"
            name="salaryMin"
            type="number"
            defaultValue={isEditing ? (target.salaryMin ?? '') : ''}
            className="flex-1"
          />
          <Field
            label="Salary max"
            name="salaryMax"
            type="number"
            defaultValue={isEditing ? (target.salaryMax ?? '') : ''}
            className="flex-1"
          />
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          Notes
          <textarea
            name="notes"
            rows={3}
            defaultValue={isEditing ? (target.notes ?? '') : ''}
            className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
          />
        </label>

        <div className="mt-2 flex items-center justify-between gap-2">
          {isEditing ? (
            <button
              type="button"
              onClick={() => {
                onDelete(target.id)
                onClose()
              }}
              className="rounded-md border border-stage-rejected/50 px-3 py-1.5 text-sm text-stage-rejected hover:bg-stage-rejected/10"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2 hover:text-ink">
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-signal-ink hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  className = '',
}: {
  label: string
  name: string
  defaultValue: string | number
  type?: string
  required?: boolean
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm text-ink-2 ${className}`}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
      />
    </label>
  )
}
