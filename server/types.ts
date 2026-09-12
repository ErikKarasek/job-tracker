export type Stage = 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected'

export const STAGES: Stage[] = ['wishlist', 'applied', 'interview', 'offer', 'rejected']

export interface Application {
  id: string
  company: string
  role: string
  jobUrl: string | null
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  source: string | null
  notes: string | null
  stage: Stage
  appliedDate: string | null
  lastActivityAt: string
  createdAt: string
  updatedAt: string
}

export interface ApplicationInput {
  company: string
  role: string
  jobUrl?: string | null
  location?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  source?: string | null
  notes?: string | null
  stage?: Stage
  appliedDate?: string | null
}

export interface StatusEvent {
  id: number
  applicationId: string
  fromStage: Stage | null
  toStage: Stage
  occurredAt: string
}

export interface StatsSummary {
  totalCount: number
  stageCounts: Record<Stage, number>
  stagesReached: {
    applied: number
    interview: number
    offer: number
  }
  funnel: {
    appliedToInterviewPct: number | null
    interviewToOfferPct: number | null
    appliedToOfferPct: number | null
  }
}

export interface TimelinePoint {
  date: string
  count: number
}

export interface Env {
  DB: D1Database
}
