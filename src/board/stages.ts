import type { Stage } from '../types'

interface StageConfig {
  key: Stage
  label: string
  accentVar: string
  description: string
}

// Single source of truth for column order + presentation. Column/Card read from this instead of
// branching on `stage === 'rejected'` etc. — adding or renaming a stage means editing this array only.
export const STAGE_CONFIG: StageConfig[] = [
  { key: 'wishlist', label: 'Wishlist', accentVar: 'var(--color-stage-wishlist)', description: 'Worth applying to' },
  { key: 'applied', label: 'Applied', accentVar: 'var(--color-stage-applied)', description: 'Waiting to hear back' },
  { key: 'interview', label: 'Interview', accentVar: 'var(--color-stage-interview)', description: 'In the process' },
  { key: 'offer', label: 'Offer', accentVar: 'var(--color-stage-offer)', description: 'Offer on the table' },
  { key: 'rejected', label: 'Rejected', accentVar: 'var(--color-stage-rejected)', description: 'Didn’t move forward' },
]

export function stageConfig(stage: Stage): StageConfig {
  const config = STAGE_CONFIG.find((s) => s.key === stage)
  if (!config) throw new Error(`Unknown stage: ${stage}`)
  return config
}
