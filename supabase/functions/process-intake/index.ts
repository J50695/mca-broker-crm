// Extract merchant + financial data from uploaded PDFs (Claude), then qualify deal.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    loc_detected?: boolean;
    avg_daily_balance?: number | null;
    negative_balance_days?: number | null;
    statement_months_analyzed?: number;
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
    "loc_detected": boolean,
    "avg_daily_balance": number | null,
    "negative_balance_days": number | null,
    "statement_months_analyzed": number
  },
  "confidence": number between 0 and 1
}

Rules:
- avg_true_monthly_deposits = average monthly true business deposits (exclude obvious transfers between own accounts).
- dti_percent = estimated debt-to-income from MCA/loan debits vs deposits.
- mca_detected / loc_detected if recurring funder debits appear on statements.
- Use null when unknown.`;

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
): string {
  if (!extractionOk) return "needs_stipulations";
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
      .select("id, merchant_id, statement_months_provided")
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
        financial: { statement_months_analyzed: deal.statement_months_provided ?? 0, mca_detected: false, loc_detected: false },
        confidence: 0,
      };
      if (!apiKey) {
        extractionError = "ANTHROPIC_API_KEY not set on edge function — add it in Supabase secrets and redeploy.";
      }
    }

    const m = extracted.merchant ?? {};
    const f = extracted.financial ?? {};

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
      mca_detected: f.mca_detected ?? false,
      loc_detected: f.loc_detected ?? false,
      avg_daily_balance: f.avg_daily_balance ?? null,
      negative_balance_days: f.negative_balance_days ?? null,
      statement_months_analyzed: f.statement_months_analyzed ?? deal.statement_months_provided ?? 0,
      extraction_confidence: extracted.confidence ?? null,
      raw_extraction: extracted,
    });

    const { data: rules } = await supabase
      .from("qualification_rules")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const qual = rules
      ? evaluateQualification(f, deal.statement_months_provided ?? 0, rules)
      : { status: "needs_review" as const, eligible: false };

    const extractionOk = !!apiKey && !extractionError;
    const nextStage = resolveStageAfterIntake(qual, extractionOk);

    await supabase
      .from("deals")
      .update({
        requested_amount: m.requested_amount ?? undefined,
        qualification_status: extractionOk ? qual.status : "needs_review",
        auto_submit_eligible: extractionOk ? qual.eligible : false,
        statement_months_provided: f.statement_months_analyzed ?? deal.statement_months_provided,
        stage: nextStage,
      })
      .eq("id", deal_id);

    const docStatus = apiKey && !extractionError ? "processed" : "needs_review";
    await supabase.from("documents").update({ status: docStatus }).eq("deal_id", deal_id);

    await supabase.from("activity_log").insert({
      deal_id,
      action_type: "intake_processed",
      note: extractionError
        ? extractionError
        : apiKey
        ? `Extracted lead data (confidence ${((extracted.confidence ?? 0) * 100).toFixed(0)}%)`
        : "Documents uploaded — add ANTHROPIC_API_KEY for auto-extraction",
      metadata: { qualification: qual.status, eligible: qual.eligible, error: extractionError },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        deal_id,
        qualification: qual.status,
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
