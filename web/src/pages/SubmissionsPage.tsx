import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import StatusBadge from '@/components/StatusBadge'
import { formatCurrency, PIPELINE_COLUMNS, type SubmissionStatus } from '@/lib/types'

type Filter = 'awaiting' | 'offers' | 'all'

type SubmissionRow = {
  id: string
  deal_id: string
  status: SubmissionStatus
  sent_at: string | null
  offer_amount: number | null
  factor_rate: number | null
  total_payback: number | null
  created_at: string
  funders: { name: string } | null
  deals: {
    id: string
    stage: string
    merchants: { business_name: string; owner_full_name: string | null } | null
  } | null
}

const AWAITING: SubmissionStatus[] = ['pending', 'sent', 'under_review']
const OFFERS: SubmissionStatus[] = [
  'offer_received',
  'contract_sent',
  'contract_signed',
  'approved',
]

export default function SubmissionsPage() {
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [filter, setFilter] = useState<Filter>('awaiting')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubmissions = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('submissions')
      .select(`
        id,
        deal_id,
        status,
        sent_at,
        offer_amount,
        factor_rate,
        total_payback,
        created_at,
        funders (name),
        deals (
          id,
          stage,
          merchants (business_name, owner_full_name)
        )
      `)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setRows(
      (data ?? []).map((row) => {
        const funders = Array.isArray(row.funders) ? (row.funders[0] ?? null) : row.funders
        const dealsRaw = Array.isArray(row.deals) ? (row.deals[0] ?? null) : row.deals
        const deals = dealsRaw
          ? {
              ...dealsRaw,
              merchants: Array.isArray(dealsRaw.merchants)
                ? (dealsRaw.merchants[0] ?? null)
                : dealsRaw.merchants,
            }
          : null
        return { ...row, funders, deals } as SubmissionRow
      }),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSubmissions()

    const channel = supabase
      .channel('submissions-portal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, () => {
        fetchSubmissions()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSubmissions])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'awaiting') return rows.filter((r) => AWAITING.includes(r.status))
    return rows.filter((r) => OFFERS.includes(r.status))
  }, [rows, filter])

  const counts = useMemo(
    () => ({
      awaiting: rows.filter((r) => AWAITING.includes(r.status)).length,
      offers: rows.filter((r) => OFFERS.includes(r.status)).length,
      all: rows.length,
    }),
    [rows],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-ink-muted">Loading submissions…</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      <header className="rounded-2xl border border-office-border bg-office-surface px-6 py-5 shadow-office">
        <h1 className="text-xl font-semibold text-ink">Submissions</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Every lender submission across all deals. Track files sent out and offers as they come back.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={filter === 'awaiting'}
          onClick={() => setFilter('awaiting')}
          label="Awaiting offer"
          count={counts.awaiting}
        />
        <FilterButton
          active={filter === 'offers'}
          onClick={() => setFilter('offers')}
          label="Offers in"
          count={counts.offers}
        />
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.all} />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-office-border bg-office-surface p-10 text-center shadow-office">
          <p className="text-sm font-medium text-ink">No submissions yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
            {filter === 'awaiting'
              ? 'Files show up here after intake is qualified and auto-submitted to matched lenders.'
              : 'No submissions match this filter.'}
          </p>
          <p className="mt-4 text-xs text-ink-muted">
            Intake upload is coming next — for now submissions are created when deals are sent to lenders.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-office-border bg-office-surface shadow-office">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-office-border bg-office-raised text-xs font-medium uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Lender</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-office-border">
                {filtered.map((row) => {
                  const merchant = row.deals?.merchants
                  const stageLabel =
                    PIPELINE_COLUMNS.find((c) => c.id === row.deals?.stage)?.title ?? row.deals?.stage ?? '—'

                  return (
                    <tr key={row.id} className="transition hover:bg-office-raised/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{merchant?.business_name ?? '—'}</p>
                        <p className="text-xs text-ink-muted">{merchant?.owner_full_name ?? ''}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-secondary">{row.funders?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{formatCurrency(row.offer_amount)}</td>
                      <td className="px-4 py-3 text-xs text-ink-muted">{stageLabel}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/clients/${row.deal_id}`}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          Open portal →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
        active
          ? 'border-accent/30 bg-accent-soft text-accent'
          : 'border-office-border bg-office-surface text-ink-secondary hover:bg-office-raised hover:text-ink',
      )}
    >
      {label}
      <span
        className={clsx(
          'rounded-full px-1.5 py-0.5 text-[11px]',
          active ? 'bg-accent/15 text-accent' : 'bg-office-raised text-ink-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}
