import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { contactEmail, contactPhone } from '@/lib/deals'
import StatusBadge from '@/components/StatusBadge'
import McaDebtsIndicator from '@/components/McaDebtsIndicator'
import MatchedLenders from '@/components/MatchedLenders'
import {
  matchLenders,
  normalizeMcaDetails,
  type FunderRecord,
  type KnownMcaFunder,
  type LenderMatchResult,
} from '@/lib/lenderMatcher'
import {
  formatActiveMcaLabel,
  formatCurrency,
  formatPercent,
  PIPELINE_COLUMNS,
  type Deal,
  type DocumentStatus,
} from '@/lib/types'

type DocRow = { id: string; file_name: string | null; doc_type: string; status: DocumentStatus }

export default function ClientPortal() {
  const { dealId } = useParams<{ dealId: string }>()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [submissions, setSubmissions] = useState<Array<Record<string, unknown>>>([])
  const [documents, setDocuments] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [lenderMatches, setLenderMatches] = useState<LenderMatchResult[]>([])

  const load = useCallback(async () => {
    if (!dealId) return

    const [{ data: dealData }, { data: subData }, { data: docData }, { data: funderData }, { data: knownMca }] =
      await Promise.all([
      supabase
        .from('deals')
        .select(`*, merchants (*), financial_snapshots (*)`)
        .eq('id', dealId)
        .single(),
      supabase
        .from('submissions')
        .select(`*, funders (name, contact_email)`)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false }),
      supabase
        .from('documents')
        .select('id, file_name, doc_type, status')
        .eq('deal_id', dealId)
        .order('created_at'),
      supabase
        .from('funders')
        .select('id, slug, name, min_fico, min_monthly_revenue, min_time_in_business_months, excluded_industries, max_advance, is_active, guidelines')
        .eq('is_active', true)
        .order('name'),
      supabase.from('known_mca_funders').select('name, match_patterns').eq('is_active', true),
    ])

    const dealRow = dealData as Deal | null
    const known = (knownMca ?? []) as KnownMcaFunder[]
    if (dealRow?.financial_snapshots?.length) {
      dealRow.financial_snapshots.sort(
        (a, b) =>
          new Date((b as { created_at?: string }).created_at ?? 0).getTime() -
          new Date((a as { created_at?: string }).created_at ?? 0).getTime(),
      )
      const latest = dealRow.financial_snapshots[0]
      dealRow.financial_snapshots[0] = {
        ...latest,
        mca_details: normalizeMcaDetails(latest.mca_details, known),
      }
    }

    setDeal(dealRow)
    setSubmissions(subData ?? [])
    setDocuments((docData as DocRow[]) ?? [])

    const snap = dealRow?.financial_snapshots?.[0]
    const merchant = dealRow?.merchants
    if (snap && funderData?.length) {
      setLenderMatches(
        matchLenders(funderData as FunderRecord[], {
          merchant: {
            industry: merchant?.industry,
            monthly_revenue: merchant?.monthly_revenue,
            time_in_business_months: merchant?.time_in_business_months,
            fico_score: merchant?.fico_score,
            owner_state: merchant?.owner_state,
          },
          financial: snap,
          statementMonths: dealRow?.statement_months_provided ?? snap.statement_months_analyzed ?? 0,
        }, known),
      )
    } else {
      setLenderMatches([])
    }

    setLoading(false)
  }, [dealId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!dealId) return
    const processing = documents.some((d) => d.status === 'processing' || d.status === 'uploading')
    if (!processing) return

    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [dealId, documents, load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-ink-muted">Loading client portal…</p>
      </div>
    )
  }
  if (!deal) return <p className="text-danger text-sm">Deal not found</p>

  const snap = deal.financial_snapshots?.[0]
  const merchant = deal.merchants
  const stageLabel = PIPELINE_COLUMNS.find((c) => c.id === deal.stage)?.title ?? deal.stage
  const isProcessing =
    retrying || documents.some((d) => d.status === 'processing' || d.status === 'uploading')
  const needsExtraction = documents.some((d) => d.status === 'needs_review')

  async function rerunExtraction() {
    if (!dealId) return
    setRetrying(true)
    setRetryError(null)
    const { data, error } = await supabase.functions.invoke('process-intake', {
      body: { deal_id: dealId },
    })
    if (error) {
      setRetryError(error.message)
      setRetrying(false)
      return
    }
    if (data?.error) {
      setRetryError(String(data.error))
    }
    await load()
    setRetrying(false)
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
      <Link to="/" className="inline-flex text-sm font-medium text-accent hover:underline">
        ← Back to pipeline
      </Link>

      {isProcessing && (
        <p className="rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent">
          Extracting data from your documents… this page updates automatically.
        </p>
      )}

      {needsExtraction && !isProcessing && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning flex flex-wrap items-center justify-between gap-3">
          <span>Documents uploaded but extraction did not complete.</span>
          <button
            type="button"
            onClick={rerunExtraction}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
          >
            Re-run extraction
          </button>
        </div>
      )}

      {retryError && (
        <p className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">
          {retryError}
        </p>
      )}

      {snap?.statements_current === false && snap?.statement_currency_notes && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">Request updated bank statements</p>
          <p className="mt-1">{snap.statement_currency_notes}</p>
          {snap.latest_statement_end_date && (
            <p className="mt-2 text-xs text-warning/90">
              Latest statement on file ends: {snap.latest_statement_end_date}
            </p>
          )}
        </div>
      )}

      {snap?.statements_current !== false && snap?.mtd_recommended && snap?.statement_currency_notes && (
        <div className="rounded-xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent">
          <p className="font-semibold">MTD recommended</p>
          <p className="mt-1">{snap.statement_currency_notes}</p>
        </div>
      )}

      <header className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{merchant?.business_name}</h1>
            <p className="text-ink-secondary mt-0.5">{merchant?.owner_full_name}</p>
          </div>
          <span className="rounded-full border border-accent/20 bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent">
            {stageLabel}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-office-border pt-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Contact email" value={contactEmail(deal)} />
          <Field label="Contact phone" value={contactPhone(deal)} />
          <Field label="Requested" value={formatCurrency(deal.requested_amount)} />
          <Field label="Statements" value={`${deal.statement_months_provided} months`} />
        </div>
        {deal.contact_notes && (
          <div className="mt-4 rounded-xl bg-office-raised border border-office-border p-4 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-1">Intake notes</p>
            <p className="text-ink-secondary whitespace-pre-wrap">{deal.contact_notes}</p>
          </div>
        )}
      </header>

      {documents.length > 0 && (
        <section className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
          <h2 className="text-base font-semibold text-ink mb-4">Uploaded files</h2>
          <ul className="space-y-2 text-sm">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-office-border bg-office-raised px-3 py-2"
              >
                <span className="truncate text-ink">{doc.file_name ?? doc.doc_type}</span>
                <DocStatusBadge status={doc.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {(snap?.mca_detected || (snap?.mca_details?.length ?? 0) > 0) && (
        <section className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
          <h2 className="text-base font-semibold text-ink mb-4">Active MCAs</h2>
          <McaDebtsIndicator mca_detected={snap!.mca_detected} mca_details={snap!.mca_details} />
        </section>
      )}

      {snap && lenderMatches.length > 0 && (
        <section className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
          <h2 className="text-base font-semibold text-ink mb-1">Matched lenders</h2>
          <p className="text-xs text-ink-muted mb-4">
            Ranked by fit using financial snapshot, merchant profile, and active MCA positions.
          </p>
          <MatchedLenders matches={lenderMatches} />
        </section>
      )}

      <section className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
        <h2 className="text-base font-semibold text-ink mb-4">Financial snapshot</h2>
        {snap ? (
          <div className="space-y-4">
            {snap.statements_current === false && (
              <p className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
                Full bank months are missing or out of date — merchant must send consecutive closed months through the prior calendar month.
              </p>
            )}
            {snap.statements_current !== false && snap.mtd_recommended && (
              <p className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent">
                Recommend current-month MTD for funding visibility — not required to submit.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Avg true deposits" value={formatCurrency(snap.avg_true_monthly_deposits)} />
            <Metric label="DTI %" value={formatPercent(snap.dti_percent)} />
            <Metric label="Avg daily balance" value={formatCurrency(snap.avg_daily_balance)} />
            <Metric label="Negative days (latest)" value={String(snap.negative_balance_days ?? '—')} />
            <Metric label="Latest statement" value={snap.latest_statement_end_date ?? '—'} />
            <Metric
              label="Statements current"
              value={snap.statements_current === false ? 'No — request banks' : snap.statements_current ? 'Yes' : '—'}
              warn={snap.statements_current === false}
            />
            <Metric
              label="Active MCAs"
              value={formatActiveMcaLabel(snap.mca_detected, snap.mca_details)}
              warn={snap.mca_detected || (snap.mca_details?.length ?? 0) > 0}
            />
            <Metric label="LOC detected" value={snap.loc_detected ? 'Yes' : 'No'} warn={snap.loc_detected} />
          </div>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No snapshot yet — upload 3–4 months of bank statements.</p>
        )}
      </section>

      <section className="rounded-2xl border border-office-border bg-office-surface p-6 shadow-office">
        <h2 className="text-base font-semibold text-ink mb-4">Lender submissions & offers</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No submissions yet. Qualified intakes auto-submit to matched lenders.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-office-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-office-raised text-ink-muted text-xs font-medium uppercase tracking-wide">
                <tr>
                  <th className="py-3 px-4">Funder</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Offer</th>
                  <th className="py-3 px-4">Factor</th>
                  <th className="py-3 px-4">Total payback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-office-border bg-office-surface">
                {submissions.map((sub) => {
                  const funder = sub.funders as { name?: string } | null
                  return (
                    <tr key={String(sub.id)} className="hover:bg-office-raised/50 transition">
                      <td className="py-3 px-4 font-medium text-ink">{funder?.name ?? '—'}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={String(sub.status)} />
                      </td>
                      <td className="py-3 px-4 text-ink-secondary">{formatCurrency(sub.offer_amount as number | null)}</td>
                      <td className="py-3 px-4 text-ink-secondary">{sub.factor_rate != null ? String(sub.factor_rate) : '—'}</td>
                      <td className="py-3 px-4 text-ink-secondary">{formatCurrency(sub.total_payback as number | null)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink" title={value}>
        {value}
      </p>
    </div>
  )
}

function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const labels: Record<DocumentStatus, string> = {
    uploading: 'Uploading',
    processing: 'Processing',
    processed: 'Processed',
    needs_review: 'Needs review',
    failed: 'Failed',
  }
  return (
    <span className="shrink-0 text-xs font-medium text-ink-muted capitalize">{labels[status]}</span>
  )
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-office-border bg-office-raised p-3.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={warn ? 'text-warning font-semibold mt-1' : 'text-ink font-semibold mt-1'}>{value}</p>
    </div>
  )
}

