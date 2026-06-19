// Supabase Edge Function: inbound-email
// Resend/SendGrid webhook — parse ISO funder emails, update submissions + deal stage.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // TODO Agent 5:
    // 1. Parse deals+{submission_id}@ from to_address
    // 2. Fallback: funder domain + Claude merchant name match
    // 3. Classify event: offer_received | contract_sent | contract_signed | funded | declined
    // 4. Update submissions + deal.stage (e.g. offer_no_contact, funded)
    // 5. Insert inbound_emails, notifications, activity_log

    await supabase.from("inbound_emails").insert({
      raw_payload: payload,
      needs_review: true,
      parsed_event: "unknown",
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
