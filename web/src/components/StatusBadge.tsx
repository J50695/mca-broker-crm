const statusColors: Record<string, string> = {
  pending: 'bg-office-raised text-ink-secondary',
  sent: 'bg-accent-soft text-accent',
  under_review: 'bg-warning-soft text-warning',
  offer_received: 'bg-success-soft text-success',
  contract_sent: 'bg-success-soft text-success',
  contract_signed: 'bg-success-soft text-success',
  approved: 'bg-success-soft text-success',
  funded: 'bg-success-soft text-success',
  declined: 'bg-danger-soft text-danger',
  needs_review: 'bg-warning-soft text-warning',
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusColors[status] ?? 'bg-office-raised text-ink-secondary'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}
