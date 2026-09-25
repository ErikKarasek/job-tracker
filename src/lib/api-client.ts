import type { Cv } from '../../server/cv/content'
import type { Tailoring } from '../../server/cv/tailor'
import type { BriefRow } from '../../server/interview/brief'
import type { AgentResult, Application, ApplicationInput, StatsSummary, Suggestion, TickResult, TimelinePoint } from '../types'
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
    // The rest of the body rides along on the error, e.g. `needsText` from the CV route.
    throw Object.assign(new Error(body.error ?? `Request failed: ${res.status}`), body)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** `status: null` means no brief has been written for the card yet. */
export type BriefResponse = Omit<BriefRow, 'status'> & { status: BriefRow['status'] | null }

export type CvResponse = { tailoring: Tailoring | null; cv: Cv; phone: string }

export const api = {
  listApplications: () => request<Application[]>('/applications'),
  createApplication: (input: ApplicationInput) =>
    request<Application>('/applications', { method: 'POST', body: JSON.stringify(input) }),
  updateApplication: (id: string, patch: Partial<ApplicationInput>) =>
    request<Application>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteApplication: (id: string) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
  draftFromPosting: (input: { url?: string; text?: string }) =>
    request<AgentResult>('/agent/draft', { method: 'POST', body: JSON.stringify(input) }),
  suggestions: () => request<{ suggestions: Suggestion[]; queued: number }>('/suggestions'),
  acceptSuggestion: (id: string) => request<Application>(`/suggestions/${id}/accept`, { method: 'POST' }),
  dismissSuggestion: (id: string) => request<void>(`/suggestions/${id}/dismiss`, { method: 'POST' }),
  scoutTick: () => request<TickResult>('/scout/tick', { method: 'POST' }),
  getCv: (id: string) => request<CvResponse>(`/applications/${id}/cv`),
  tailorCv: (id: string, text?: string) =>
    request<CvResponse>(`/applications/${id}/cv`, { method: 'POST', body: JSON.stringify({ text }) }),
  getBrief: (id: string) => request<BriefResponse>(`/applications/${id}/brief`),
  writeBrief: (id: string, text?: string) =>
    request<{ status: 'writing' }>(`/applications/${id}/brief`, { method: 'POST', body: JSON.stringify({ text }) }),
  aiSpend: () => request<{ total: number; byFeature: Record<string, number> }>('/ai/spend'),
  statsSummary: () => request<StatsSummary>('/stats/summary'),
  statsTimeline: () => request<TimelinePoint[]>('/stats/timeline'),
  statsStale: (days = 14) => request<Application[]>(`/stats/stale?days=${days}`),
}
