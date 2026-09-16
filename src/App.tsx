import { useState } from 'react'
import { Board } from './board/Board'
import { StatsDashboard } from './stats/StatsDashboard'
import { useAdminKey } from './lib/admin-key'

type View = 'board' | 'stats'

export default function App() {
  const [view, setView] = useState<View>('board')
  const { canEdit, unlock, lock } = useAdminKey()

  return (
    <main className="min-h-screen bg-bg">
      <nav className="flex gap-1 border-b border-line-soft px-4 pt-3 sm:px-6">
        <TabButton active={view === 'board'} onClick={() => setView('board')}>
          Board
        </TabButton>
        <TabButton active={view === 'stats'} onClick={() => setView('stats')}>
          Stats
        </TabButton>
        <LockButton canEdit={canEdit} onUnlock={unlock} onLock={lock} />
      </nav>
      {view === 'board' ? <Board canEdit={canEdit} /> : <StatsDashboard />}
    </main>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`rounded-t-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
        active ? 'border-b-2 border-signal text-ink' : 'text-mute hover:text-ink-2'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Without a key the board is a read-only view, which is what a visitor coming from the
 * case study should get. The key lives only in this browser; see lib/admin-key.ts.
 */
function LockButton({ canEdit, onUnlock, onLock }: { canEdit: boolean; onUnlock: (key: string) => void; onLock: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (canEdit) return onLock()
        const entered = window.prompt('Admin key')
        if (entered) onUnlock(entered)
      }}
      title={canEdit ? 'Lock editing again' : 'Enter the admin key to edit'}
      className="ml-auto self-center rounded-md px-2 py-1 text-xs text-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
    >
      {canEdit ? 'Unlocked' : 'Read-only'}
    </button>
  )
}
