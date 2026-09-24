export type { Application, ApplicationInput, Stage, StatsSummary, StatusEvent, TimelinePoint } from '../server/types'
export { STAGES } from '../server/types'
export type { AgentResult, TraceStep } from '../server/agent/run'
export type { Draft } from '../server/agent/tools'

/** A posting the scout found and scored, waiting in the inbox (see server/scout/). */
export interface Suggestion {
  id: string
  jobUrl: string
  title: string
  company: string | null
  location: string | null
  remote: number
  query: string
  fitScore: number | null
  fitSummary: string | null
  coverLetter: string | null
  salaryMin: number | null
  salaryMax: number | null
  foundAt: string
  scoredAt: string | null
}
export type { TickResult } from '../server/scout/tick'
