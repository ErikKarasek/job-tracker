interface FunnelStep {
  label: string
  count: number
}

// A <table> underneath, not a div soup — screen readers get real tabular data, sighted
// users see bars. Single series (count of applications reaching a stage), so one hue,
// no legend needed. Bar cap ≤24px thick, 4px rounded data-end, value labeled at the tip.
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count))

  return (
    <table className="w-full border-collapse">
      <caption className="mb-2 text-left text-sm text-mute">Applications reaching each stage</caption>
      <tbody>
        {steps.map((step) => (
          <tr key={step.label}>
            <th scope="row" className="w-24 py-1.5 pr-3 text-left text-sm font-normal text-ink-2">
              {step.label}
            </th>
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-5 rounded-r bg-signal"
                  style={{ width: `${Math.max(4, (step.count / max) * 100)}%` }}
                />
                <span className="font-mono text-xs text-ink">{step.count}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
