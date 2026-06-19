import type { FinancialSnapshot, McaDetail } from './types'

export type FunderGuidelines = {
  product?: string
  positions?: string
  max_existing_mca_payoffs?: number
  max_competitor_consolidation?: number
  min_avg_daily_balance?: number
  max_negative_days?: number
  max_negative_days_per_month?: number
  max_negative_days_3mo?: number
  max_negative_days_with_od?: number
  max_negative_days_without_od?: number
  bank_statements_months?: number
  min_deposits_per_month?: number
  excluded_states?: string[]
  min_fico_new_1st_no_mca_history?: number
  min_tib_new_1st_no_mca_history?: number
  sweet_spot?: {
    min_fico?: number
    min_monthly_revenue?: number
    min_tib_months?: number
    min_avg_daily_balance?: number
  }
  notes?: string
}

export type FunderRecord = {
  id: string
  slug: string
  name: string
  min_fico: number | null
  min_monthly_revenue: number | null
  min_time_in_business_months: number | null
  excluded_industries: string[]
  max_advance: number | null
  is_active: boolean
  guidelines: FunderGuidelines
}

export type KnownMcaFunder = {
  name: string
  match_patterns: string[]
}

export type MerchantProfile = {
  industry?: string | null
  monthly_revenue?: number | null
  time_in_business_months?: number | null
  fico_score?: number | null
  owner_state?: string | null
}

export type MatchContext = {
  merchant: MerchantProfile
  financial: FinancialSnapshot
  statementMonths: number
}

export type LenderMatchResult = {
  funderId: string
  funderName: string
  slug: string
  matched: boolean
  score: number
  reasons: string[]
  disqualifiers: string[]
}

type PositionPolicy = {
  minExisting: number
  maxExisting: number
  label: string
}

function parsePositionPolicy(positions?: string, guidelines?: FunderGuidelines): PositionPolicy {
  const payoffs = guidelines?.max_existing_mca_payoffs
  const pos = (positions ?? '').toLowerCase()

  if (pos.includes('1st_only') || pos === '1st') {
    return { minExisting: 0, maxExisting: 0, label: '1st position only' }
  }
  if (pos.includes('2nd_and_3rd')) {
    return { minExisting: 1, maxExisting: payoffs ?? 2, label: '2nd or 3rd position' }
  }
  if (pos.includes('1st_to_3rd')) {
    return { minExisting: 0, maxExisting: payoffs ?? 2, label: '1st through 3rd position' }
  }
  if (pos.includes('1st_and_2nd')) {
    return { minExisting: 0, maxExisting: payoffs ?? 1, label: '1st or 2nd position' }
  }
  if (payoffs != null) {
    return { minExisting: 0, maxExisting: payoffs, label: `up to ${payoffs} existing payoff(s)` }
  }
  return { minExisting: 0, maxExisting: 99, label: 'any position' }
}

export function normalizeFunderName(raw: string, known: KnownMcaFunder[]): string {
  const upper = raw.toUpperCase().replace(/\s+/g, ' ').trim()
  for (const entry of known) {
    for (const pattern of entry.match_patterns) {
      if (upper.includes(pattern.toUpperCase())) return entry.name
    }
  }
  return raw.trim()
}

export function normalizeMcaDetails(
  details: McaDetail[] | null | undefined,
  known: KnownMcaFunder[],
): McaDetail[] {
  return (details ?? []).map((d) => {
    const normalized = normalizeFunderName(d.funder_name, known)
    const notes =
      normalized !== d.funder_name.trim()
        ? [d.notes, `ACH: ${d.funder_name}`].filter(Boolean).join(' · ')
        : d.notes
    return { ...d, funder_name: normalized, notes: notes || null }
  })
}

function industryExcluded(industry: string | null | undefined, excluded: string[]): boolean {
  if (!industry?.trim()) return false
  const hay = industry.toLowerCase()
  return excluded.some((term) => hay.includes(term.toLowerCase()))
}

function existingFunderNames(details: McaDetail[]): string[] {
  return details.map((d) => d.funder_name).filter(Boolean)
}

function formatFunderList(names: string[]): string {
  if (names.length === 0) return 'none'
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
}

export function matchLenders(
  funders: FunderRecord[],
  ctx: MatchContext,
  knownMcaFunders: KnownMcaFunder[] = [],
): LenderMatchResult[] {
  const mcaDetails = normalizeMcaDetails(ctx.financial.mca_details, knownMcaFunders)
  const existingCount = mcaDetails.length
  const existingNames = existingFunderNames(mcaDetails)
  const { merchant, financial, statementMonths } = ctx

  const revenue = merchant.monthly_revenue ?? financial.avg_true_monthly_deposits
  const fico = merchant.fico_score
  const tib = merchant.time_in_business_months
  const industry = merchant.industry
  const state = merchant.owner_state?.toUpperCase()

  return funders
    .filter((f) => f.is_active)
    .map((funder) => {
      const g = funder.guidelines ?? {}
      const reasons: string[] = []
      const disqualifiers: string[] = []
      let score = 50

      const positionPolicy = parsePositionPolicy(g.positions, g)
      const maxExisting = Math.min(
        positionPolicy.maxExisting,
        g.max_existing_mca_payoffs ?? positionPolicy.maxExisting,
      )

      if (existingCount > maxExisting) {
        disqualifiers.push(
          existingCount === 0
            ? `${funder.name} requires an existing MCA (${positionPolicy.label})`
            : `Already has ${formatFunderList(existingNames)} — ${funder.name} allows ${positionPolicy.label} (max ${maxExisting} active)`,
        )
      } else if (existingCount < positionPolicy.minExisting) {
        disqualifiers.push(
          `${funder.name} requires at least ${positionPolicy.minExisting} existing MCA position (${positionPolicy.label})`,
        )
      } else if (existingCount > 0) {
        reasons.push(
          `${existingCount} active MCA${existingCount === 1 ? '' : 's'} fits ${positionPolicy.label}`,
        )
        score += 10
      } else {
        reasons.push('Clean 1st position file')
        score += 5
      }

      if (industryExcluded(industry, funder.excluded_industries)) {
        disqualifiers.push(`Industry "${industry}" excluded by ${funder.name}`)
      }

      const minFico =
        existingCount === 0 && g.min_fico_new_1st_no_mca_history != null
          ? Math.max(funder.min_fico ?? 0, g.min_fico_new_1st_no_mca_history)
          : funder.min_fico

      if (minFico != null && fico != null && fico < minFico) {
        disqualifiers.push(`FICO ${fico} below ${funder.name} minimum (${minFico})`)
      } else if (minFico != null && fico != null && fico >= minFico) {
        reasons.push(`FICO ${fico} meets minimum (${minFico})`)
        score += Math.min(15, Math.floor((fico - minFico) / 10))
      }

      const minTib =
        existingCount === 0 && g.min_tib_new_1st_no_mca_history != null
          ? Math.max(funder.min_time_in_business_months ?? 0, g.min_tib_new_1st_no_mca_history)
          : funder.min_time_in_business_months

      if (minTib != null && tib != null && tib < minTib) {
        disqualifiers.push(`Time in business ${tib} mo below ${funder.name} minimum (${minTib} mo)`)
      } else if (minTib != null && tib != null) {
        reasons.push(`TIB ${tib} mo meets minimum (${minTib} mo)`)
        score += 5
      }

      const minRevenue = funder.min_monthly_revenue
      if (minRevenue != null && revenue != null && revenue < minRevenue) {
        disqualifiers.push(
          `Monthly revenue/deposits ${Math.round(revenue).toLocaleString()} below ${funder.name} minimum (${Math.round(minRevenue).toLocaleString()})`,
        )
      } else if (minRevenue != null && revenue != null) {
        reasons.push(`Deposits/revenue meet ${funder.name} minimum`)
        score += 10
      }

      const minAdb = g.min_avg_daily_balance ?? g.sweet_spot?.min_avg_daily_balance
      if (minAdb != null && financial.avg_daily_balance != null && financial.avg_daily_balance < minAdb) {
        disqualifiers.push(
          `Avg daily balance below ${funder.name} minimum ($${Math.round(minAdb).toLocaleString()})`,
        )
      } else if (minAdb != null && financial.avg_daily_balance != null) {
        reasons.push('Avg daily balance meets guideline')
        score += 5
      }

      const maxNeg =
        g.max_negative_days_per_month ??
        g.max_negative_days ??
        g.max_negative_days_3mo ??
        g.max_negative_days_with_od
      if (maxNeg != null && financial.negative_balance_days != null && financial.negative_balance_days > maxNeg) {
        disqualifiers.push(
          `${financial.negative_balance_days} negative days exceeds ${funder.name} max (${maxNeg})`,
        )
      }

      const stmtRequired = g.bank_statements_months ?? 3
      if (statementMonths < stmtRequired) {
        disqualifiers.push(`Only ${statementMonths} statement month(s) — ${funder.name} requires ${stmtRequired}`)
      } else {
        reasons.push(`${statementMonths} months of statements on file`)
        score += 5
      }

      if (financial.statements_current === false) {
        disqualifiers.push('Bank statements not current — update before submitting')
      }

      if (state && g.excluded_states?.includes(state)) {
        disqualifiers.push(`${state} excluded by ${funder.name}`)
      }

      const sweet = g.sweet_spot
      if (sweet && fico != null && revenue != null && tib != null) {
        const hits =
          (sweet.min_fico == null || fico >= sweet.min_fico) &&
          (sweet.min_monthly_revenue == null || revenue >= sweet.min_monthly_revenue) &&
          (sweet.min_tib_months == null || tib >= sweet.min_tib_months) &&
          (sweet.min_avg_daily_balance == null ||
            (financial.avg_daily_balance != null && financial.avg_daily_balance >= sweet.min_avg_daily_balance))
        if (hits) {
          reasons.push('In lender sweet spot')
          score += 20
        }
      }

      if (funder.max_advance != null && revenue != null && revenue * 2 > funder.max_advance) {
        score += 5
      }

      const matched = disqualifiers.length === 0
      if (matched) score += 10

      return {
        funderId: funder.id,
        funderName: funder.name,
        slug: funder.slug,
        matched,
        score: matched ? score : 0,
        reasons,
        disqualifiers,
      }
    })
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1
      return b.score - a.score
    })
}
