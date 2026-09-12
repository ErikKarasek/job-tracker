import { useCallback, useEffect, useState } from 'react'
import type { Application, ApplicationInput, Stage } from '../types'
import { api } from '../lib/api-client'

// Calls the real API with optimistic local updates: the UI applies the change immediately,
// then rolls back to the pre-change snapshot if the request fails. Callers (Board/Column/Card)
// see the same shape this hook had in the static-board phase, so nothing above this changed.
export function useBoardData() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listApplications()
      .then(setApplications)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load applications'))
      .finally(() => setLoading(false))
  }, [])

  const createApplication = useCallback((input: ApplicationInput) => {
    setError(null)
    api
      .createApplication(input)
      .then((created) => setApplications((prev) => [created, ...prev]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to create application'))
  }, [])

  const updateApplication = useCallback((id: string, patch: Partial<ApplicationInput>) => {
    setError(null)
    let snapshot: Application[] = []
    setApplications((prev) => {
      snapshot = prev
      return prev.map((app) => (app.id === id ? { ...app, ...patch, lastActivityAt: new Date().toISOString() } : app))
    })
    api.updateApplication(id, patch).catch((e) => {
      setApplications(snapshot)
      setError(e instanceof Error ? e.message : 'Failed to update application')
    })
  }, [])

  const moveApplication = useCallback(
    (id: string, stage: Stage) => updateApplication(id, { stage }),
    [updateApplication],
  )

  const deleteApplication = useCallback((id: string) => {
    setError(null)
    let snapshot: Application[] = []
    setApplications((prev) => {
      snapshot = prev
      return prev.filter((app) => app.id !== id)
    })
    api.deleteApplication(id).catch((e) => {
      setApplications(snapshot)
      setError(e instanceof Error ? e.message : 'Failed to delete application')
    })
  }, [])

  return { applications, loading, error, createApplication, updateApplication, moveApplication, deleteApplication }
}
