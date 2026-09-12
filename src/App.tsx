import { useState } from 'react'
import { Board } from './board/Board'
import { StatsDashboard } from './stats/StatsDashboard'

type View = 'board' | 'stats'

export default function App() {
  const [view, setView] = useState<View>('board')

  return (
    <main className="min-h-screen bg-bg">
      <nav className="flex gap-1 border-b border-line-soft px-4 pt-3 sm:px-6">
        <TabButton active={view === 'board'} onClick={() => setView('board')}>
          Board
        </TabButton>
        <TabButton active={view === 'stats'} onClick={() => setView('stats')}>
          Stats
        </TabButton>
      </nav>
      {view === 'board' ? <Board /> : <StatsDashboard />}
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
