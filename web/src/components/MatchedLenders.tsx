import type { LenderMatchResult } from '@/lib/lenderMatcher'

type Props = {
  matches: LenderMatchResult[]
  compact?: boolean
  limit?: number
}

export default function MatchedLenders({ matches, compact, limit }: Props) {
  const shown = limit != null ? matches.slice(0, limit) : matches
  const matched = shown.filter((m) => m.matched)
  const disqualified = shown.filter((m) => !m.matched)

  if (matches.length === 0) {
    return <p className="text-sm text-ink-muted">No lenders in roster.</p>
  }

  if (compact) {
    if (matched.length === 0) {
      return (
        <p className="text-[10px] text-ink-muted">
          No lender matches
        </p>
      )
    }
    return (
      <div className="flex flex-wrap gap-1">
        {matched.slice(0, 2).map((m) => (
          <span
            key={m.funderId}
            className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success truncate max-w-full"
            title={m.reasons.join(' · ')}
          >
            {m.funderName}
          </span>
        ))}
        {matched.length > 2 && (
          <span className="text-[10px] text-ink-muted">+{matched.length - 2}</span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {matched.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-success mb-2">
            Matched ({matched.length})
          </p>
          <ul className="space-y-2">
            {matched.map((m) => (
              <li
                key={m.funderId}
                className="rounded-xl border border-success/25 bg-success-soft/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-ink text-sm">{m.funderName}</p>
                  <span className="shrink-0 text-xs font-medium text-success">Fit score {m.score}</span>
                </div>
                {m.reasons.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-secondary">
                    {m.reasons.map((r) => (
                      <li key={r}>✓ {r}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {disqualified.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">
            Not a fit ({disqualified.length})
          </p>
          <ul className="space-y-2">
            {disqualified.map((m) => (
              <li
                key={m.funderId}
                className="rounded-xl border border-office-border bg-office-raised px-4 py-3"
              >
                <p className="font-medium text-ink-secondary text-sm">{m.funderName}</p>
                {m.disqualifiers.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
                    {m.disqualifiers.map((d) => (
                      <li key={d}>✗ {d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matched.length === 0 && disqualified.length === 0 && (
        <p className="text-sm text-ink-muted">Run extraction to evaluate lender fit.</p>
      )}
    </div>
  )
}
