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
  /** 0-100, set by the job-posting agent; null for cards added by hand. */
  fitScore: number | null
  fitSummary: string | null
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
  fitScore?: number | null
  fitSummary?: string | null
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
  /**
   * Shared secret for everything that changes data. Reading the board needs nothing;
   * creating, editing, moving and deleting need this in an `x-admin-key` header.
   * Set it with: wrangler pages secret put ADMIN_KEY --project-name job-tracker
   * While it is unset the API refuses every write — an instance nobody has configured
   * should be read-only, not open to the world.
   */
  ADMIN_KEY?: string
  /** Workers AI, for the job-posting agent (server/agent/). No key: it runs on this account. */
  AI?: Ai
}
