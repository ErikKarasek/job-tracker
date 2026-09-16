import { useCallback, useState } from 'react'

// The key that unlocks writing. Kept in localStorage so it survives a reload, and
// never in the bundle — a secret shipped to every visitor would not be a secret.
const STORAGE_KEY = 'job-tracker.admin-key'

export function readAdminKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private windows and blocked site data both throw here; treat it as locked.
    return null
  }
}

/** Whether this browser holds a key, plus the two actions that change that. */
export function useAdminKey() {
  const [key, setKey] = useState<string | null>(() => readAdminKey())

  const unlock = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      localStorage.setItem(STORAGE_KEY, trimmed)
    } catch {
      // Not persisted, but this session can still write.
    }
    setKey(trimmed)
  }, [])

  const lock = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing stored to begin with.
    }
    setKey(null)
  }, [])

  return { canEdit: key !== null, unlock, lock }
}
