export type DealStage =
  | 'new_intake'
  | 'ready_to_submit'
  | 'needs_stipulations'
  | 'no_contact'
  | 'contacted_follow_up'
  | 'chasing'
  | 'offer_no_contact'
  | 'offer_not_interested'
  | 'follow_up_no_offer'
  | 'no_offer'
  | 'funded'
  | 'default'

export type SubmissionStatus =
  | 'pending'
  | 'sent'
  | 'under_review'
  | 'offer_received'
  | 'contract_sent'
  | 'contract_signed'
  | 'approved'
  | 'declined'
  | 'funded'
  | 'needs_review'

export type DocumentType =
  | 'application'
  | 'bank_statement'
  | 'processing_statement'
  | 'voided_check'
  | 'drivers_license'
  | 'contract'
  | 'other'

export type DocumentStatus = 'uploading' | 'processing' | 'processed' | 'needs_review' | 'failed'

export interface PipelineColumn {
  id: DealStage
  title: string
  description: string
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: 'new_intake', title: 'New Intake', description: 'Just uploaded — extraction still running' },
  {
    id: 'ready_to_submit',
    title: 'Ready to Submit',
    description: 'Complete package — submit to matched lenders immediately',
  },
  {
    id: 'needs_stipulations',
    title: 'Needs Stipulations',
    description: 'Contact merchant for missing docs (statements, voided check, ID, etc.)',
  },
  { id: 'no_contact', title: 'Submitted — No Contact', description: 'Out to lenders; merchant not reached yet' },
  { id: 'contacted_follow_up', title: 'Contacted / Follow Up', description: 'Spoke with merchant; awaiting response' },
  { id: 'chasing', title: 'Chasing', description: 'Actively pursuing merchant on offers' },
  { id: 'offer_no_contact', title: 'Offer — No Contact', description: 'Offer in portal; cannot reach merchant' },
  { id: 'offer_not_interested', title: 'Offer — Not Interested', description: 'Merchant declined offer' },
  { id: 'follow_up_no_offer', title: 'Follow Up — No Offer', description: 'Working a no-offer file' },
  { id: 'no_offer', title: 'No Offer', description: 'No usable offer from funders' },
  { id: 'funded', title: 'Funded', description: 'Deal funded' },
  { id: 'default', title: 'Default', description: 'Post-funding default' },
]

export interface Merchant {
  id: string
  business_name: string
  owner_full_name: string | null
  phone: string | null
  email: string | null
  intake_received_at: string
}

export type StatementPeriod = {
  period_start: string | null
  period_end: string | null
  label: string | null
}

export type McaFrequency = 'daily' | 'weekly' | 'monthly'

export interface McaDetail {
  funder_name: string
  debit_amount?: number | null
  frequency?: McaFrequency | null
  monthly_estimate?: number | null
  last_activity_date?: string | null
  notes?: string | null
}

export interface FinancialSnapshot {
  avg_true_monthly_deposits: number | null
  dti_percent: number | null
  mca_detected: boolean
  mca_details?: McaDetail[]
  loc_detected: boolean
  avg_daily_balance: number | null
  negative_balance_days: number | null
  latest_statement_end_date?: string | null
  statements_current?: boolean
  mtd_recommended?: boolean
  statement_periods?: StatementPeriod[]
  statement_currency_notes?: string | null
}

export interface Deal {
  id: string
  merchant_id: string
  stage: DealStage
  requested_amount: number | null
  assigned_agent_id: string | null
  contact_notes: string | null
  email_override: string | null
  phone_override: string | null
  qualification_status: string
  auto_submitted_at: string | null
  statement_months_provided: number
  created_at: string
  merchants?: Merchant
  financial_snapshots?: FinancialSnapshot[]
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

const MCA_FREQUENCY_LABEL: Record<McaFrequency, string> = {
  daily: 'day',
  weekly: 'wk',
  monthly: 'mo',
}

export function formatMcaDetailSummary(detail: McaDetail): string {
  const parts: string[] = [detail.funder_name]
  if (detail.debit_amount != null && detail.frequency) {
    parts.push(`${formatCurrency(detail.debit_amount)}/${MCA_FREQUENCY_LABEL[detail.frequency]}`)
  } else if (detail.debit_amount != null) {
    parts.push(formatCurrency(detail.debit_amount))
  } else if (detail.monthly_estimate != null) {
    parts.push(`~${formatCurrency(detail.monthly_estimate)}/mo`)
  }
  return parts.join(' · ')
}
