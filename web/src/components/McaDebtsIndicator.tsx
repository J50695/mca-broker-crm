import { formatMcaDetailSummary, type McaDetail } from '@/lib/types'

type Props = {
  mca_detected: boolean
  mca_details?: McaDetail[] | null
  compact?: boolean
}

export default function McaDebtsIndicator({ mca_detected, mca_details, compact }: Props) {
  const details = (mca_details ?? []).filter((d) => d.funder_name?.trim())
  if (!mca_detected && details.length === 0) return null

  if (compact) {
    if (details.length === 0) {
      return (
        <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
          MCA
        </span>
      )
    }

    return (
      <>
        {details.map((detail, index) => (
          <span
            key={`${detail.funder_name}-${index}`}
            className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning truncate max-w-full"
            title={formatMcaDetailSummary(detail)}
          >
            {detail.funder_name}
          </span>
        ))}
      </>
    )
  }

  if (details.length === 0) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning-soft p-3.5">
        <p className="text-xs text-ink-muted">MCA detected · Last 2 months</p>
        <p className="text-warning font-semibold mt-1">Yes — funder details not extracted</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft p-3.5 sm:col-span-2 lg:col-span-3">
      <p className="text-xs font-medium text-ink-muted mb-2">
        MCA positions detected
        <span className="font-normal text-ink-muted/80"> · Last 2 months</span>
      </p>
      <ul className="space-y-1.5">
        {details.map((detail, index) => (
          <li
            key={`${detail.funder_name}-${index}`}
            className="text-sm font-semibold text-warning"
          >
            {formatMcaDetailSummary(detail)}
            {detail.notes && (
              <span className="block text-xs font-normal text-ink-secondary mt-0.5">{detail.notes}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
