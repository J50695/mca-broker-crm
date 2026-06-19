import { useCallback, useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { groupDealsByStage } from '@/lib/deals'
import { PIPELINE_COLUMNS, formatCurrency, formatPercent, type Deal, type DealStage } from '@/lib/types'
import McaDebtsIndicator from '@/components/McaDebtsIndicator'
import MatchedLenders from '@/components/MatchedLenders'
import { matchLenders, normalizeMcaDetails, type FunderRecord, type KnownMcaFunder } from '@/lib/lenderMatcher'
import clsx from 'clsx'

function DealCard({
  deal,
  funders,
  knownMca,
}: {
  deal: Deal
  funders: FunderRecord[]
  knownMca: KnownMcaFunder[]
}) {
  const snap = deal.financial_snapshots?.[0]
  const merchant = deal.merchants
  const normalizedSnap = snap
    ? { ...snap, mca_details: normalizeMcaDetails(snap.mca_details, knownMca) }
    : undefined
  const matches =
    normalizedSnap && funders.length
      ? matchLenders(funders, {
          merchant: {
            industry: merchant?.industry,
            monthly_revenue: merchant?.monthly_revenue,
            time_in_business_months: merchant?.time_in_business_months,
            fico_score: merchant?.fico_score,
            owner_state: merchant?.owner_state,
          },
          financial: normalizedSnap,
          statementMonths: deal.statement_months_provided ?? normalizedSnap.statement_months_analyzed ?? 0,
        }, knownMca)
      : []

  return (
    <Link
      to={`/clients/${deal.id}`}
      className="block rounded-xl border border-office-border bg-office-surface p-3.5 shadow-office transition hover:border-accent/30 hover:shadow-office-md"
    >
      <p className="font-semibold text-ink truncate text-[13px]">{merchant?.business_name ?? 'Unknown'}</p>
      <p className="text-xs text-ink-muted truncate mt-0.5">{merchant?.owner_full_name}</p>
      <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs border-t border-office-border pt-3">
        <span className="text-ink-muted">Deposits</span>
        <span className="text-right font-medium text-success">{formatCurrency(snap?.avg_true_monthly_deposits)}</span>
        <span className="text-ink-muted">DTI</span>
        <span className="text-right font-medium text-ink">{formatPercent(snap?.dti_percent)}</span>
        <span className="text-ink-muted">Requested</span>
        <span className="text-right font-medium text-ink">{formatCurrency(deal.requested_amount)}</span>
      </div>
      {(snap?.mca_detected || snap?.loc_detected) && (
        <div className="mt-2.5 flex gap-1 flex-wrap">
          {snap.mca_detected && (
            <McaDebtsIndicator
              compact
              mca_detected={snap.mca_detected}
              mca_details={normalizedSnap?.mca_details ?? snap.mca_details}
            />
          )}
          {snap.loc_detected && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">LOC</span>
          )}
        </div>
      )}
      {deal.stage === 'ready_to_submit' && matches.length > 0 && (
        <div className="mt-2.5 border-t border-office-border pt-2">
          <p className="text-[10px] font-medium text-ink-muted mb-1">Matched lenders</p>
          <MatchedLenders matches={matches} compact limit={5} />
        </div>
      )}
      {deal.stage === 'ready_to_submit' && !deal.auto_submitted_at && (
        <p className="mt-2 text-[10px] font-semibold text-accent">Submit now</p>
      )}
      {deal.stage === 'needs_stipulations' && (
        <p className="mt-2 text-[10px] font-semibold text-warning">Needs stips</p>
      )}
      {deal.financial_snapshots?.[0]?.statements_current === false && (
        <p className="mt-2 text-[10px] font-semibold text-warning">Need full bank months</p>
      )}
      {deal.financial_snapshots?.[0]?.statements_current !== false &&
        deal.financial_snapshots?.[0]?.mtd_recommended && (
          <p className="mt-2 text-[10px] font-medium text-accent">MTD recommended</p>
        )}
      {deal.auto_submitted_at && (
        <p className="mt-2 text-[10px] font-medium text-success">Submitted to lenders</p>
      )}
    </Link>
  )
}

export default function PipelineBoard() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [funders, setFunders] = useState<FunderRecord[]>([])
  const [knownMca, setKnownMca] = useState<KnownMcaFunder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDeals = useCallback(async () => {
    const [{ data, error: fetchError }, { data: funderData }, { data: knownData }] = await Promise.all([
      supabase
        .from('deals')
        .select(`
        *,
        merchants (*),
        financial_snapshots (*)
      `)
        .order('created_at', { ascending: false }),
      supabase
        .from('funders')
        .select('id, slug, name, min_fico, min_monthly_revenue, min_time_in_business_months, excluded_industries, max_advance, is_active, guidelines')
        .eq('is_active', true),
      supabase.from('known_mca_funders').select('name, match_patterns').eq('is_active', true),
    ])

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setDeals((data as Deal[]) ?? [])
    setFunders((funderData as FunderRecord[]) ?? [])
    setKnownMca((knownData as KnownMcaFunder[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDeals()

    const channel = supabase
      .channel('deals-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchDeals()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchDeals])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const newStage = destination.droppableId as DealStage
    setDeals((prev) =>
      prev.map((d) => (d.id === draggableId ? { ...d, stage: newStage } : d)),
    )

    const { error: updateError } = await supabase
      .from('deals')
      .update({ stage: newStage })
      .eq('id', draggableId)

    if (updateError) {
      setError(updateError.message)
      fetchDeals()
    }
  }

  const grouped = groupDealsByStage(deals)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-ink-muted">Loading pipeline…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-office-border bg-office-surface px-6 py-5 shadow-office">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-ink">Pipeline</h1>
            <p className="text-sm text-ink-secondary mt-1 max-w-2xl">
              Complete files land in Ready to Submit — push to lenders right away. Incomplete files go to Needs
              Stipulations until you get docs from the merchant.
            </p>
          </div>
          <Link
            to="/intake"
            className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            + New intake
          </Link>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
            {!import.meta.env.VITE_SUPABASE_URL && ' — Add Supabase credentials to web/.env.local'}
          </p>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-6">
          {PIPELINE_COLUMNS.map((col) => (
            <div key={col.id} className="flex w-[272px] shrink-0 flex-col">
              <div className="mb-2 rounded-t-xl border border-b-0 border-office-border bg-office-raised px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[13px] font-semibold text-ink leading-snug">{col.title}</h2>
                  <span className="shrink-0 rounded-full bg-office-surface border border-office-border px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                    {(grouped[col.id] ?? []).length}
                  </span>
                </div>
                <p className="text-[10px] text-ink-muted leading-tight mt-1">{col.description}</p>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={clsx(
                      'min-h-[420px] flex-1 rounded-b-xl border border-office-border p-2 space-y-2 transition-colors',
                      snapshot.isDraggingOver ? 'bg-accent-soft/50 border-accent/30' : 'bg-office-raised/60',
                    )}
                  >
                    {(grouped[col.id] ?? []).map((deal, index) => (
                      <Draggable key={deal.id} draggableId={deal.id} index={index}>
                        {(dragProvided) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                          >
                            <DealCard deal={deal} funders={funders} knownMca={knownMca} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  )
}
