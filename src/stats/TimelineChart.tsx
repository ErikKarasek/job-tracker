interface TimelinePoint {
  date: string
  count: number
}

const BAR_AREA_HEIGHT = 96

// Vertical bars, one hue, baseline hairline. Only the tallest bar gets a visible value label
// (label selectively, not a number on every bar) — every value is still in the table markup
// for screen readers via the visually-hidden span.
export function TimelineChart({ points }: { points: TimelinePoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count))

  return (
    <table className="w-full border-collapse">
      <caption className="mb-2 text-left text-sm text-mute">Applications started per day</caption>
      <tbody>
        <tr>
          {points.map((p) => (
            <td key={p.date} className="align-bottom px-1">
              <div className="flex flex-col items-center justify-end" style={{ height: BAR_AREA_HEIGHT }}>
                {p.count === max && <span aria-hidden="true" className="mb-1 font-mono text-xs text-ink">{p.count}</span>}
                <span className="sr-only">{`${p.count} on ${p.date}`}</span>
                <div
                  title={`${p.count} on ${p.date}`}
                  className="w-full max-w-6 rounded-t bg-signal"
                  style={{ height: `${Math.max(4, (p.count / max) * (BAR_AREA_HEIGHT - 20))}px` }}
                />
              </div>
            </td>
          ))}
        </tr>
        <tr aria-hidden="true" className="border-t border-line-soft text-mute">
          {points.map((p) => (
            <td key={p.date} className="px-1 pt-1 text-center font-mono text-[10px]">
              {p.date.slice(5)}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
