import type { Application, ApplicationInput, StatsSummary, TimelinePoint } from '../types'
import { readAdminKey } from './admin-key'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Reads need no key; the server only asks for one on the methods that change data,
  // so sending it whenever we hold one keeps every call site unchanged.
  const adminKey = readAdminKey()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(adminKey ? { 'x-admin-key': adminKey } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listApplications: () => request<Application[]>('/applications'),
  createApplication: (input: ApplicationInput) =>
    request<Application>('/applications', { method: 'POST', body: JSON.stringify(input) }),
  updateApplication: (id: string, patch: Partial<ApplicationInput>) =>
    request<Application>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteApplication: (id: string) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
  statsSummary: () => request<StatsSummary>('/stats/summary'),
  statsTimeline: () => request<TimelinePoint[]>('/stats/timeline'),
  statsStale: (days = 14) => request<Application[]>(`/stats/stale?days=${days}`),
}
