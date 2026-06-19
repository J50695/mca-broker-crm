import type { Deal, DealStage } from './types'

/** Intake queue sort: receipt date desc, then highest true deposits, then lowest DTI */
export function sortIntakeQueueDeals(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => {
    const merchantA = a.merchants
    const merchantB = b.merchants
    const dateA = merchantA?.intake_received_at ?? a.created_at
    const dateB = merchantB?.intake_received_at ?? b.created_at
    const dateCmp = new Date(dateB).getTime() - new Date(dateA).getTime()
    if (dateCmp !== 0) return dateCmp

    const snapA = a.financial_snapshots?.[0]
    const snapB = b.financial_snapshots?.[0]
    const depA = snapA?.avg_true_monthly_deposits ?? 0
    const depB = snapB?.avg_true_monthly_deposits ?? 0
    if (depB !== depA) return depB - depA

    const dtiA = snapA?.dti_percent ?? 999
    const dtiB = snapB?.dti_percent ?? 999
    return dtiA - dtiB
  })
}

export function groupDealsByStage(deals: Deal[]): Record<DealStage, Deal[]> {
  const grouped = {} as Record<DealStage, Deal[]>
  for (const deal of deals) {
    if (!grouped[deal.stage]) grouped[deal.stage] = []
    grouped[deal.stage].push(deal)
  }
  for (const stage of ['new_intake', 'ready_to_submit'] as const) {
    if (grouped[stage]) {
      grouped[stage] = sortIntakeQueueDeals(grouped[stage])
    }
  }
  return grouped
}

export function contactEmail(deal: Deal): string {
  return deal.email_override ?? deal.merchants?.email ?? '—'
}

export function contactPhone(deal: Deal): string {
  return deal.phone_override ?? deal.merchants?.phone ?? '—'
}
