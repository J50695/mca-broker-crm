// Extract merchant + financial data from uploaded PDFs (Claude), then qualify deal.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type StatementPeriod = {
  period_start?: string | null;
  period_end?: string | null;
  label?: string | null;
  is_partial_month?: boolean;
};

type McaDetail = {
  funder_name?: string | null;
  debit_amount?: number | null;
  frequency?: "daily" | "weekly" | "monthly" | null;
  monthly_estimate?: number | null;
  last_activity_date?: string | null;
  notes?: string | null;
};

/** MCA positions must show debits within this many calendar months (inclusive of reference month). */
const MCA_RECENCY_CALENDAR_MONTHS = 2;

type ExtractionResult = {
  merchant: {
    business_name?: string | null;
    owner_full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    industry?: string | null;
    monthly_revenue?: number | null;
    time_in_business_months?: number | null;
    fico_score?: number | null;
    requested_amount?: number | null;
  };
  financial: {
    avg_true_monthly_deposits?: number | null;
    dti_percent?: number | null;
    mca_detected?: boolean;
    mca_details?: McaDetail[];
    loc_detected?: boolean;
    avg_daily_balance?: number | null;
    negative_balance_days?: number | null;
    statement_months_analyzed?: number;
    statement_periods?: StatementPeriod[];
    latest_statement_end_date?: string | null;
  };
  confidence?: number;
};

const EXTRACTION_PROMPT = `You are an MCA broker intake assistant. Extract structured data from the attached PDFs.
The first document(s) labeled application contain the merchant application.
Bank statement PDFs contain deposit and balance history.

Return ONLY valid JSON (no markdown) matching this schema:
{
  "merchant": {
    "business_name": string,
    "owner_full_name": string | null,
    "phone": string | null,
    "email": string | null,
    "industry": string | null,
    "monthly_revenue": number | null,
    "time_in_business_months": number | null,
    "fico_score": number | null,
    "requested_amount": number | null
  },
  "financial": {
    "avg_true_monthly_deposits": number | null,
    "dti_percent": number | null,
    "mca_detected": boolean,
    "mca_details": [
      {
        "funder_name": "string — name as it appears on the bank statement",
        "debit_amount": number | null,
        "frequency": "daily" | "weekly" | "monthly" | null,
        "monthly_estimate": number | null,
        "last_activity_date": "YYYY-MM-DD — date of the most recent MCA/funder debit on statements",
        "notes": "optional broker note, e.g. ACH descriptor"
      }
    ],
    "loc_detected": boolean,
    "avg_daily_balance": number | null,
    "negative_balance_days": number | null,
    "statement_months_analyzed": number,
    "statement_periods": [
      {
        "period_start": "YYYY-MM-DD or null",
        "period_end": "YYYY-MM-DD or null",
        "label": "e.g. March 2025 or null",
        "is_partial_month": "true if month-to-date / partial month (incomplete calendar month)"
      }
    ],
    "latest_statement_end_date": "YYYY-MM-DD — end date of the most recent bank statement period"
  },
  "confidence": number between 0 and 1
}

Rules:
- avg_true_monthly_deposits = average monthly true business deposits (exclude obvious transfers between own accounts).
- dti_percent = estimated debt-to-income from MCA/loan debits vs deposits. Use ONLY MCA/funder debits with transaction dates in the last 2 calendar months (relative to latest_statement_end_date, or today if unknown) — ignore older paid-off or inactive MCA positions.
- mca_detected = true only if at least one MCA/funder position has a recurring debit with last_activity_date in the last 2 calendar months (see MCA recency rules below). False if all MCA activity is older than that window.
- mca_details = one entry per distinct ACTIVE MCA/funder position with debits in the last 2 calendar months. Include funder name from the statement, debit_amount per occurrence, frequency, monthly_estimate, and last_activity_date (most recent debit date). Do NOT include historical MCAs that stopped debiting more than 2 calendar months before latest_statement_end_date. Empty array if none are active in that window.
- MCA recency: anchor to latest_statement_end_date (or today). Include a position only if its last_activity_date falls in the reference month or the prior calendar month (2 calendar months total). Example: if latest statement ends 2026-05-31, include debits from April 2026 and May 2026 only; exclude March 2026 and earlier.
- loc_detected if recurring line-of-credit debits appear on statements.
- For EACH bank statement PDF, add one entry to statement_periods with the statement period dates read from the document header.
- latest_statement_end_date = the end date of the newest bank statement (must be read from statements, not guessed from upload date).
- statement_months_analyzed = count of distinct bank statement periods provided.
- The CURRENT calendar month is usually incomplete — mark it is_partial_month: true when the statement is month-to-date (MTD), not a full closed month.
- Submission requires consecutive full closed months through the prior calendar month (e.g. in June: March, April, May). Current-month MTD is optional but preferred after the 15th.
- Use null when unknown.`;

const MTD_RECOMMENDED_AFTER_DAY = 15;

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function exampleFullMonths(today: Date, count: number): string {
  const names: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    names.push(monthLabel(d));
  }
  return names.join(", ");
}

function isPartialPeriod(period: StatementPeriod, today: Date): boolean {
  if (period.is_partial_month === true) return true;
  if (period.is_partial_month === false) return false;
  const end = parseIsoDate(period.period_end);
  if (!end) return false;
  return monthKey(end) === monthKey(today);
}

function evaluateStatementCurrency(
  financial: ExtractionResult["financial"],
  uploadedStatementCount: number,
  maxMtdLagDays: number,
  minStatementMonths: number,
): {
  current: boolean;
  mtdRecommended: boolean;
  latestEndDate: string | null;
  blockingNotes: string | null;
  advisoryNotes: string | null;
  notes: string | null;
  periods: StatementPeriod[];
} {
  const periods = financial.statement_periods ?? [];
  const today = new Date();
  const todayMonth = monthKey(today);
  const currentMonthName = monthLabel(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const priorMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const priorMonthKey = monthKey(priorMonthStart);
  const priorMonthName = monthLabel(priorMonthStart);
  const mtdWindowOpen = today.getUTCDate() > MTD_RECOMMENDED_AFTER_DAY;

  const fullPeriods = periods.filter((p) => !isPartialPeriod(p, today));
  const fullMonthEnds = fullPeriods
    .map((p) => parseIsoDate(p.period_end))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  const allEnds = periods
    .map((p) => parseIsoDate(p.period_end))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  let latest = parseIsoDate(financial.latest_statement_end_date);
  if (!latest && allEnds.length) latest = allEnds[0];

  const blockingIssues: string[] = [];
  const advisoryIssues: string[] = [];
  const fullMonthCount = Math.max(fullMonthEnds.length, fullPeriods.length);

  if (fullMonthCount < minStatementMonths && uploadedStatementCount < minStatementMonths) {
    blockingIssues.push(
      `Need at least ${minStatementMonths} full-month bank statements (e.g. ${exampleFullMonths(today, minStatementMonths)}).`,
    );
  } else if (fullMonthCount < minStatementMonths) {
    blockingIssues.push(
      `Need at least ${minStatementMonths} full-month bank statements on file — only ${fullMonthCount} closed month(s) detected.`,
    );
  }

  if (fullMonthEnds.length === 0) {
    blockingIssues.push(
      `Could not read full-month statement dates — request ${exampleFullMonths(today, minStatementMonths)} from the merchant.`,
    );
  } else {
    const latestFull = fullMonthEnds[0];
    if (monthKey(latestFull) !== priorMonthKey) {
      blockingIssues.push(
        `Most recent full statement should be ${priorMonthName} — newest full month on file ends ${formatDate(latestFull)}.`,
      );
    }

    if (fullMonthEnds.length >= 2) {
      for (let i = 0; i < fullMonthEnds.length - 1; i++) {
        const newer = fullMonthEnds[i];
        const older = fullMonthEnds[i + 1];
        const gap = daysBetween(newer, older);
        if (gap > 45) {
          blockingIssues.push(
            `Missing statement month between ${formatDate(older)} and ${formatDate(newer)} — request the complete consecutive months from the merchant.`,
          );
          break;
        }
      }
    }
  }

  const currentMonthMtd = periods.find((p) => {
    const end = parseIsoDate(p.period_end);
    return end !== null && monthKey(end) === todayMonth && isPartialPeriod(p, today);
  });
  const mtdEnd = currentMonthMtd ? parseIsoDate(currentMonthMtd.period_end) : null;

  let mtdRecommended = false;
  if (mtdWindowOpen) {
    if (!mtdEnd) {
      mtdRecommended = true;
      advisoryIssues.push(`Recommend ${currentMonthName} month-to-date (MTD) — not required to submit.`);
    } else {
      const daysSinceMtd = daysBetween(today, mtdEnd);
      if (daysSinceMtd > maxMtdLagDays) {
        mtdRecommended = true;
        advisoryIssues.push(
          `${currentMonthName} MTD only runs through ${formatDate(mtdEnd)} (${daysSinceMtd} days ago) — consider requesting a fresh download (not required to submit).`,
        );
      }
    }
  }

  const current = blockingIssues.length === 0;
  const blockingNotes = blockingIssues.length ? blockingIssues.join(" ") : null;
  const advisoryNotes = advisoryIssues.length ? advisoryIssues.join(" ") : null;
  const notes = [blockingNotes, advisoryNotes].filter(Boolean).join(" ") || null;

  return {
    current,
    mtdRecommended,
    latestEndDate: latest ? formatDate(latest) : null,
    blockingNotes,
    advisoryNotes,
    notes,
    periods,
  };
}

async function fileToBase64(supabase: ReturnType<typeof createClient>, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("deal-documents").download(path);
  if (error || !data) throw new Error(`Download failed: ${path}`);
  const buf = await data.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function extractWithClaude(
  apiKey: string,
  docs: { label: string; base64: string }[],
): Promise<ExtractionResult> {
  const content: Array<Record<string, unknown>> = [];

  for (const doc of docs) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: doc.base64 },
    });
    content.push({ type: "text", text: `Document type: ${doc.label}` });
  }

  content.push({ type: "text", text: EXTRACTION_PROMPT });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} ${errText}`);
  }

  const body = await res.json();
  const text = body.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Claude response");
  return JSON.parse(jsonMatch[0]) as ExtractionResult;
}

/** First day of the earliest calendar month in the 2-month MCA window ending at referenceDate. */
function mcaRecencyWindowStart(referenceDate: Date): Date {
  return new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() - (MCA_RECENCY_CALENDAR_MONTHS - 1),
      1,
    ),
  );
}

function filterRecentMcaDetails(
  details: McaDetail[] | null | undefined,
  referenceDate: Date,
): { mca_detected: boolean; mca_details: McaDetail[] } {
  const windowStart = mcaRecencyWindowStart(referenceDate);

  const mca_details = (details ?? [])
    .filter((d) => {
      if (!d.funder_name?.trim()) return false;
      const last = parseIsoDate(d.last_activity_date);
      if (!last) return false;
      return last >= windowStart;
    })
    .map((d) => ({
      funder_name: d.funder_name!.trim(),
      debit_amount: d.debit_amount ?? null,
      frequency: d.frequency ?? null,
      monthly_estimate: d.monthly_estimate ?? null,
      last_activity_date: d.last_activity_date ?? null,
      notes: d.notes?.trim() || null,
    }));

  return {
    mca_detected: mca_details.length > 0,
    mca_details,
  };
}

function evaluateQualification(
  financial: ExtractionResult["financial"],
  statementMonths: number,
  rules: {
    min_statement_months: number;
    max_statement_months: number;
    min_true_monthly_deposits: number | null;
    max_dti_percent: number | null;
    max_negative_balance_days: number | null;
  },
): { status: "qualified" | "disqualified" | "needs_review"; eligible: boolean } {
  if (statementMonths < rules.min_statement_months) {
    return { status: "needs_review", eligible: false };
  }

  const deposits = financial.avg_true_monthly_deposits;
  const dti = financial.dti_percent;
  const negDays = financial.negative_balance_days;

  if (deposits == null || dti == null) {
    return { status: "needs_review", eligible: false };
  }

  if (rules.min_true_monthly_deposits != null && deposits < rules.min_true_monthly_deposits) {
    return { status: "disqualified", eligible: false };
  }
  if (rules.max_dti_percent != null && dti > rules.max_dti_percent) {
    return { status: "disqualified", eligible: false };
  }
  if (rules.max_negative_balance_days != null && negDays != null && negDays > rules.max_negative_balance_days) {
    return { status: "disqualified", eligible: false };
  }

  return { status: "qualified", eligible: true };
}

function resolveStageAfterIntake(
  qual: { status: "qualified" | "disqualified" | "needs_review"; eligible: boolean },
  extractionOk: boolean,
  statementsCurrent: boolean,
): string {
  if (!extractionOk) return "needs_stipulations";
  if (!statementsCurrent) return "needs_stipulations";
  if (qual.status === "qualified" && qual.eligible) return "ready_to_submit";
  if (qual.status === "needs_review") return "needs_stipulations";
  if (qual.status === "disqualified") return "no_offer";
  return "new_intake";
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
      .select("id, merchant_id, statement_months_provided, notes")
      .eq("id", deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: documents } = await supabase
      .from("documents")
      .select("id, doc_type, file_path, file_name")
      .eq("deal_id", deal_id)
      .order("created_at");

    if (!documents?.length) {
      return new Response(JSON.stringify({ error: "No documents" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bankStatementCount = documents.filter((d) => d.doc_type === "bank_statement").length;

    let apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      const { data: cfg } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "anthropic_api_key")
        .maybeSingle();
      apiKey = cfg?.value ?? undefined;
    }
    let extracted: ExtractionResult | null = null;
    let extractionError: string | null = null;

    await supabase.from("documents").update({ status: "processing" }).eq("deal_id", deal_id);
    await supabase.from("financial_snapshots").delete().eq("deal_id", deal_id);

    if (apiKey) {
      const docsForClaude: { label: string; base64: string }[] = [];
      for (const doc of documents) {
        const base64 = await fileToBase64(supabase, doc.file_path);
        docsForClaude.push({
          label: doc.doc_type === "application" ? "application" : "bank_statement",
          base64,
        });
      }
      try {
        extracted = await extractWithClaude(apiKey, docsForClaude);
      } catch (claudeErr) {
        extractionError = String(claudeErr);
        console.error("Claude extraction failed:", extractionError);
      }
    }

    if (!extracted) {
      const appDoc = documents.find((d) => d.doc_type === "application");
      const fallbackName = appDoc?.file_name?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") ?? "New intake";
      extracted = {
        merchant: { business_name: fallbackName },
        financial: {
          statement_months_analyzed: bankStatementCount || (deal.statement_months_provided ?? 0),
          mca_detected: false,
          mca_details: [],
          loc_detected: false,
          statement_periods: [],
        },
        confidence: 0,
      };
      if (!apiKey) {
        extractionError = "ANTHROPIC_API_KEY not set on edge function — add it in Supabase secrets and redeploy.";
      }
    }

    const m = extracted.merchant ?? {};
    const f = extracted.financial ?? {};

    const { data: rules } = await supabase
      .from("qualification_rules")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const maxMtdLagDays = rules?.max_statement_age_days ?? 10;
    const minStatementMonths = rules?.min_statement_months ?? 3;
    const statementMonths = f.statement_months_analyzed ?? bankStatementCount ?? (deal.statement_months_provided ?? 0);

    const currency = evaluateStatementCurrency(f, bankStatementCount, maxMtdLagDays, minStatementMonths);

    const mcaReference = parseIsoDate(currency.latestEndDate) ?? parseIsoDate(f.latest_statement_end_date) ?? new Date();
    const mca = filterRecentMcaDetails(f.mca_details, mcaReference);

    if (m.business_name) {
      await supabase
        .from("merchants")
        .update({
          business_name: m.business_name,
          owner_full_name: m.owner_full_name ?? undefined,
          phone: m.phone ?? undefined,
          email: m.email ?? undefined,
          industry: m.industry ?? undefined,
          monthly_revenue: m.monthly_revenue ?? undefined,
          time_in_business_months: m.time_in_business_months ?? undefined,
          fico_score: m.fico_score ?? undefined,
        })
        .eq("id", deal.merchant_id);
    }

    await supabase.from("financial_snapshots").insert({
      merchant_id: deal.merchant_id,
      deal_id: deal.id,
      avg_true_monthly_deposits: f.avg_true_monthly_deposits ?? null,
      dti_percent: f.dti_percent ?? null,
      mca_detected: mca.mca_detected,
      mca_details: mca.mca_details,
      loc_detected: f.loc_detected ?? false,
      avg_daily_balance: f.avg_daily_balance ?? null,
      negative_balance_days: f.negative_balance_days ?? null,
      statement_months_analyzed: statementMonths,
      latest_statement_end_date: currency.latestEndDate,
      statements_current: currency.current,
      mtd_recommended: currency.mtdRecommended,
      statement_periods: currency.periods,
      statement_currency_notes: currency.notes,
      extraction_confidence: extracted.confidence ?? null,
      raw_extraction: extracted,
    });

    let qual = rules
      ? evaluateQualification(f, statementMonths, rules)
      : { status: "needs_review" as const, eligible: false };

    if (!currency.current) {
      qual = { status: "needs_review", eligible: false };
    }

    const extractionOk = !!apiKey && !extractionError;
    const nextStage = resolveStageAfterIntake(qual, extractionOk, currency.current);

    const stipNote = currency.blockingNotes
      ? `[Stip — bank statements] ${currency.blockingNotes}`
      : null;

    await supabase
      .from("deals")
      .update({
        requested_amount: m.requested_amount ?? undefined,
        qualification_status: extractionOk ? qual.status : "needs_review",
        auto_submit_eligible: extractionOk && currency.current ? qual.eligible : false,
        statement_months_provided: statementMonths,
        stage: nextStage,
        notes: stipNote ?? deal.notes ?? undefined,
      })
      .eq("id", deal_id);

    const docStatus = apiKey && !extractionError ? "processed" : "needs_review";
    await supabase.from("documents").update({ status: docStatus }).eq("deal_id", deal_id);

    await supabase.from("activity_log").insert({
      deal_id,
      action_type: "intake_processed",
      note: extractionError
        ? extractionError
        : currency.blockingNotes
        ? `Bank statements need review: ${currency.blockingNotes}`
        : currency.advisoryNotes
        ? `MTD advisory: ${currency.advisoryNotes}`
        : apiKey
        ? `Extracted lead data (confidence ${((extracted.confidence ?? 0) * 100).toFixed(0)}%) — full months current through ${currency.latestEndDate ?? "unknown"}`
        : "Documents uploaded — add ANTHROPIC_API_KEY for auto-extraction",
      metadata: {
        qualification: qual.status,
        eligible: qual.eligible,
        statements_current: currency.current,
        mtd_recommended: currency.mtdRecommended,
        latest_statement_end_date: currency.latestEndDate,
        error: extractionError,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        deal_id,
        qualification: qual.status,
        statements_current: currency.current,
        mtd_recommended: currency.mtdRecommended,
        statement_currency_notes: currency.notes,
        latest_statement_end_date: currency.latestEndDate,
        extracted: !!apiKey && !extractionError,
        error: extractionError,
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
