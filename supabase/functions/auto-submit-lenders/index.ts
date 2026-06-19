// Supabase Edge Function: auto-submit-lenders
// Matches funders by merchant profile + financial snapshot + existing MCAs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type McaDetail = {
  funder_name: string;
  debit_amount?: number | null;
  frequency?: string | null;
  monthly_estimate?: number | null;
  last_activity_date?: string | null;
  notes?: string | null;
};

type FunderGuidelines = {
  positions?: string;
  max_existing_mca_payoffs?: number;
  min_avg_daily_balance?: number;
  max_negative_days?: number;
  max_negative_days_per_month?: number;
  max_negative_days_3mo?: number;
  max_negative_days_with_od?: number;
  bank_statements_months?: number;
  excluded_states?: string[];
  min_fico_new_1st_no_mca_history?: number;
  min_tib_new_1st_no_mca_history?: number;
  sweet_spot?: Record<string, number>;
};

type FunderRow = {
  id: string;
  slug: string;
  name: string;
  min_fico: number | null;
  min_monthly_revenue: number | null;
  min_time_in_business_months: number | null;
  excluded_industries: string[];
  max_advance: number | null;
  is_active: boolean;
  guidelines: FunderGuidelines;
};

type KnownMca = { name: string; match_patterns: string[] };

function normalizeFunderName(raw: string, known: KnownMca[]): string {
  const upper = raw.toUpperCase().replace(/\s+/g, " ").trim();
  for (const entry of known) {
    for (const pattern of entry.match_patterns) {
      if (upper.includes(pattern.toUpperCase())) return entry.name;
    }
  }
  return raw.trim();
}

function parsePositionPolicy(positions?: string, guidelines?: FunderGuidelines) {
  const payoffs = guidelines?.max_existing_mca_payoffs;
  const pos = (positions ?? "").toLowerCase();
  if (pos.includes("1st_only") || pos === "1st") return { minExisting: 0, maxExisting: 0, label: "1st position only" };
  if (pos.includes("2nd_and_3rd")) return { minExisting: 1, maxExisting: payoffs ?? 2, label: "2nd or 3rd position" };
  if (pos.includes("1st_to_3rd")) return { minExisting: 0, maxExisting: payoffs ?? 2, label: "1st through 3rd position" };
  if (pos.includes("1st_and_2nd")) return { minExisting: 0, maxExisting: payoffs ?? 1, label: "1st or 2nd position" };
  if (payoffs != null) return { minExisting: 0, maxExisting: payoffs, label: `up to ${payoffs} existing payoff(s)` };
  return { minExisting: 0, maxExisting: 99, label: "any position" };
}

function industryExcluded(industry: string | null | undefined, excluded: string[]): boolean {
  if (!industry?.trim()) return false;
  const hay = industry.toLowerCase();
  return excluded.some((term) => hay.includes(term.toLowerCase()));
}

function matchFunders(
  funders: FunderRow[],
  known: KnownMca[],
  input: {
    merchant: {
      industry?: string | null;
      monthly_revenue?: number | null;
      time_in_business_months?: number | null;
      fico_score?: number | null;
      owner_state?: string | null;
    };
    financial: {
      avg_true_monthly_deposits?: number | null;
      avg_daily_balance?: number | null;
      negative_balance_days?: number | null;
      statements_current?: boolean;
      mca_details?: McaDetail[];
    };
    statementMonths: number;
  },
) {
  const mcaDetails = (input.financial.mca_details ?? []).map((d) => ({
    ...d,
    funder_name: normalizeFunderName(d.funder_name, known),
  }));
  const existingCount = mcaDetails.length;
  const existingNames = mcaDetails.map((d) => d.funder_name);
  const revenue = input.merchant.monthly_revenue ?? input.financial.avg_true_monthly_deposits;
  const { fico_score: fico, time_in_business_months: tib, industry, owner_state: state } = input.merchant;

  return funders
    .filter((f) => f.is_active)
    .map((funder) => {
      const g = funder.guidelines ?? {};
      const reasons: string[] = [];
      const disqualifiers: string[] = [];
      let score = 50;

      const positionPolicy = parsePositionPolicy(g.positions, g);
      const maxExisting = Math.min(positionPolicy.maxExisting, g.max_existing_mca_payoffs ?? positionPolicy.maxExisting);

      if (existingCount > maxExisting) {
        disqualifiers.push(
          existingCount === 0
            ? `${funder.name} requires an existing MCA (${positionPolicy.label})`
            : `Already has ${existingNames.join(", ")} — ${funder.name} allows ${positionPolicy.label} (max ${maxExisting} active)`,
        );
      } else if (existingCount < positionPolicy.minExisting) {
        disqualifiers.push(`${funder.name} requires at least ${positionPolicy.minExisting} existing MCA (${positionPolicy.label})`);
      } else if (existingCount > 0) {
        reasons.push(`${existingCount} active MCA(s) fits ${positionPolicy.label}`);
        score += 10;
      }

      if (industryExcluded(industry, funder.excluded_industries)) {
        disqualifiers.push(`Industry "${industry}" excluded`);
      }

      const minFico =
        existingCount === 0 && g.min_fico_new_1st_no_mca_history != null
          ? Math.max(funder.min_fico ?? 0, g.min_fico_new_1st_no_mca_history)
          : funder.min_fico;
      if (minFico != null && fico != null && fico < minFico) disqualifiers.push(`FICO ${fico} below minimum (${minFico})`);
      else if (minFico != null && fico != null) score += 10;

      const minTib =
        existingCount === 0 && g.min_tib_new_1st_no_mca_history != null
          ? Math.max(funder.min_time_in_business_months ?? 0, g.min_tib_new_1st_no_mca_history)
          : funder.min_time_in_business_months;
      if (minTib != null && tib != null && tib < minTib) disqualifiers.push(`TIB ${tib} mo below minimum (${minTib} mo)`);

      if (funder.min_monthly_revenue != null && revenue != null && revenue < funder.min_monthly_revenue) {
        disqualifiers.push(`Revenue/deposits below ${funder.name} minimum`);
      } else if (funder.min_monthly_revenue != null && revenue != null) score += 10;

      const minAdb = g.min_avg_daily_balance;
      if (minAdb != null && input.financial.avg_daily_balance != null && input.financial.avg_daily_balance < minAdb) {
        disqualifiers.push(`Avg daily balance below minimum ($${Math.round(minAdb)})`);
      }

      const maxNeg = g.max_negative_days_per_month ?? g.max_negative_days ?? g.max_negative_days_3mo ?? g.max_negative_days_with_od;
      if (maxNeg != null && input.financial.negative_balance_days != null && input.financial.negative_balance_days > maxNeg) {
        disqualifiers.push(`${input.financial.negative_balance_days} negative days exceeds max (${maxNeg})`);
      }

      const stmtRequired = g.bank_statements_months ?? 3;
      if (input.statementMonths < stmtRequired) disqualifiers.push(`Requires ${stmtRequired} statement months`);

      if (input.financial.statements_current === false) disqualifiers.push("Bank statements not current");

      if (state && g.excluded_states?.includes(state.toUpperCase())) disqualifiers.push(`${state} excluded`);

      const matched = disqualifiers.length === 0;
      if (matched) score += 10;

      return {
        funder_id: funder.id,
        funder_name: funder.name,
        slug: funder.slug,
        matched,
        score: matched ? score : 0,
        reasons,
        disqualifiers,
      };
    })
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1;
      return b.score - a.score;
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { deal_id } = await req.json();
    if (!deal_id) {
      return new Response(JSON.stringify({ error: "deal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("id, merchant_id, statement_months_provided, auto_submit_eligible")
      .eq("id", deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: merchant }, { data: snapshot }, { data: funders }, { data: known }] = await Promise.all([
      supabase.from("merchants").select("*").eq("id", deal.merchant_id).single(),
      supabase
        .from("financial_snapshots")
        .select("*")
        .eq("deal_id", deal_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("funders")
        .select("id, slug, name, min_fico, min_monthly_revenue, min_time_in_business_months, excluded_industries, max_advance, is_active, guidelines")
        .eq("is_active", true),
      supabase.from("known_mca_funders").select("name, match_patterns").eq("is_active", true),
    ]);

    if (!snapshot) {
      return new Response(JSON.stringify({ error: "No financial snapshot" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matches = matchFunders((funders ?? []) as FunderRow[], (known ?? []) as KnownMca[], {
      merchant: merchant ?? {},
      financial: snapshot,
      statementMonths: deal.statement_months_provided ?? snapshot.statement_months_analyzed ?? 0,
    });

    const eligible = matches.filter((m) => m.matched);

    // TODO: create submission records + send Resend emails for eligible matches
    return new Response(
      JSON.stringify({
        ok: true,
        deal_id,
        matched_count: eligible.length,
        matches,
        status: eligible.length ? "matched" : "no_matches",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
