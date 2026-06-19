// Admin-provision new CRM agents (invite-only). Secured by provisioning secret in app_config.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-provision-key",
};

type AgentRole = "admin" | "agent" | "team_lead";

type ProvisionBody = {
  email?: string;
  password?: string;
  name?: string;
  role?: AgentRole;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  for (const byte of bytes) out += chars[byte % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const provisionKey = req.headers.get("x-provision-key");
  if (!provisionKey) return json(401, { error: "Missing provisioning key" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: secretRow, error: secretError } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "provisioning_secret")
    .maybeSingle();

  if (secretError || !secretRow?.value || secretRow.value !== provisionKey) {
    return json(403, { error: "Invalid provisioning key" });
  }

  let body: ProvisionBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const role: AgentRole = body.role ?? "agent";
  const password = body.password?.trim() || generatePassword();

  if (!email || !name) return json(400, { error: "email and name are required" });
  if (!["admin", "agent", "team_lead"].includes(role)) {
    return json(400, { error: "role must be admin, agent, or team_lead" });
  }
  if (password.length < 8) return json(400, { error: "password must be at least 8 characters" });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role,
      invited_by_admin: true,
    },
  });

  if (error) {
    return json(400, { error: error.message });
  }

  return json(200, {
    ok: true,
    user_id: data.user?.id,
    email,
    name,
    role,
    temporary_password: body.password ? undefined : password,
  });
});
