// Supabase Edge Function: auto-submit-lenders
// Matches funders by merchant profile, creates submissions, sends proposal emails via Resend.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { deal_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // TODO Agent 3: fetch deal + merchant + financial_snapshot
    // TODO: match funders (FICO, revenue, TIB, excluded industries)
    // TODO: create submission records with tracking_email deals+{submission_id}@domain
    // TODO: send Resend email with docs attached
    // TODO: set deal.auto_submitted_at, log activity, notify assigned agent

    return new Response(JSON.stringify({ ok: true, deal_id, status: "stub" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
