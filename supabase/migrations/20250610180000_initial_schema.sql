-- MCA Broker CRM — initial schema
-- Run in Supabase SQL Editor or via: supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE deal_stage AS ENUM (
  'new_intake',
  'ready_to_submit',
  'needs_stipulations',
  'no_contact',
  'contacted_follow_up',
  'chasing',
  'offer_no_contact',
  'offer_not_interested',
  'follow_up_no_offer',
  'no_offer',
  'funded',
  'default'
);

CREATE TYPE agent_role AS ENUM ('agent', 'team_lead', 'admin');

CREATE TYPE submission_status AS ENUM (
  'pending',
  'sent',
  'under_review',
  'offer_received',
  'contract_sent',
  'contract_signed',
  'approved',
  'declined',
  'funded',
  'needs_review'
);

CREATE TYPE submission_method AS ENUM ('email', 'portal', 'api');

CREATE TYPE payment_frequency AS ENUM ('daily', 'weekly');

CREATE TYPE document_type AS ENUM (
  'application',
  'bank_statement',
  'processing_statement',
  'voided_check',
  'drivers_license',
  'contract',
  'other'
);

CREATE TYPE document_status AS ENUM ('uploading', 'processing', 'processed', 'needs_review', 'failed');

CREATE TYPE commission_status AS ENUM ('pending', 'paid');

CREATE TYPE qualification_status AS ENUM ('pending', 'qualified', 'disqualified', 'needs_review');

CREATE TYPE inbound_email_event AS ENUM (
  'offer_received',
  'contract_sent',
  'contract_signed',
  'funded',
  'declined',
  'under_review',
  'unknown'
);

CREATE TYPE notification_type AS ENUM (
  'mention',
  'offer_received',
  'contract_sent',
  'contract_signed',
  'funded',
  'declined',
  'stage_change',
  'intake_processed',
  'auto_submit',
  'needs_review'
);

-- Agents (profiles linked to auth.users)
CREATE TABLE agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role agent_role NOT NULL DEFAULT 'agent',
  commission_split_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (commission_split_percent >= 0 AND commission_split_percent <= 100),
  team_lead_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Merchants
CREATE TABLE merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  owner_full_name TEXT,
  owner_dob DATE,
  owner_ssn_last4 TEXT,
  owner_ssn_encrypted TEXT,
  owner_address_line1 TEXT,
  owner_address_line2 TEXT,
  owner_city TEXT,
  owner_state TEXT,
  owner_zip TEXT,
  phone TEXT,
  email TEXT,
  industry TEXT,
  monthly_revenue NUMERIC(14,2),
  time_in_business_months INTEGER,
  fico_score INTEGER,
  source TEXT,
  intake_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deals
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  stage deal_stage NOT NULL DEFAULT 'new_intake',
  requested_amount NUMERIC(14,2),
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  contact_notes TEXT,
  email_override TEXT,
  phone_override TEXT,
  qualification_status qualification_status NOT NULL DEFAULT 'pending',
  auto_submit_eligible BOOLEAN NOT NULL DEFAULT false,
  auto_submitted_at TIMESTAMPTZ,
  statement_months_provided INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Financial snapshots (refreshed on statement upload)
CREATE TABLE financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  avg_true_monthly_deposits NUMERIC(14,2),
  dti_percent NUMERIC(6,2),
  dti_percent_latest NUMERIC(6,2),
  mca_detected BOOLEAN NOT NULL DEFAULT false,
  loc_detected BOOLEAN NOT NULL DEFAULT false,
  mca_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  loc_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  significant_transfers JSONB NOT NULL DEFAULT '[]'::jsonb,
  avg_daily_balance NUMERIC(14,2),
  negative_balance_days INTEGER,
  statement_months_analyzed INTEGER NOT NULL DEFAULT 0,
  suggested_funding_min NUMERIC(14,2),
  suggested_funding_max NUMERIC(14,2),
  extraction_confidence NUMERIC(4,3),
  raw_extraction JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Funders
CREATE TABLE funders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_fico INTEGER,
  min_monthly_revenue NUMERIC(14,2),
  min_time_in_business_months INTEGER,
  excluded_industries TEXT[] NOT NULL DEFAULT '{}',
  max_factor_rate NUMERIC(6,4),
  typical_turnaround_days INTEGER,
  contact_email TEXT,
  email_domain TEXT,
  submission_method submission_method NOT NULL DEFAULT 'email',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Known MCA funder name patterns (for statement debit matching)
CREATE TABLE known_mca_funders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  match_patterns TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-qualification rules (admin-configurable)
CREATE TABLE qualification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  min_statement_months INTEGER NOT NULL DEFAULT 3,
  max_statement_months INTEGER NOT NULL DEFAULT 4,
  min_true_monthly_deposits NUMERIC(14,2),
  max_dti_percent NUMERIC(6,2),
  max_mca_count INTEGER,
  max_negative_balance_days INTEGER,
  min_fico INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submissions
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  funder_id UUID NOT NULL REFERENCES funders(id) ON DELETE RESTRICT,
  status submission_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  tracking_email TEXT,
  offer_amount NUMERIC(14,2),
  factor_rate NUMERIC(6,4),
  term_days INTEGER,
  holdback_percent NUMERIC(5,2),
  payment_frequency payment_frequency,
  total_payback NUMERIC(14,2) GENERATED ALWAYS AS (
    CASE WHEN offer_amount IS NOT NULL AND factor_rate IS NOT NULL
      THEN offer_amount * factor_rate
      ELSE NULL
    END
  ) STORED,
  parse_confidence NUMERIC(4,3),
  is_best_offer BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, funder_id)
);

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  doc_type document_type NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  status document_status NOT NULL DEFAULT 'uploading',
  statement_month DATE,
  extraction JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Commissions
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  percent NUMERIC(5,2) NOT NULL,
  status commission_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inbound emails (ISO funder notifications)
CREATE TABLE inbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  funder_id UUID REFERENCES funders(id) ON DELETE SET NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  body_text TEXT,
  raw_payload JSONB,
  parsed_event inbound_email_event,
  parse_confidence NUMERIC(4,3),
  needs_review BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email templates (outbound proposals)
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  funder_id UUID REFERENCES funders(id) ON DELETE CASCADE,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_merchant ON deals(merchant_id);
CREATE INDEX idx_deals_assigned ON deals(assigned_agent_id);
CREATE INDEX idx_deals_created ON deals(created_at DESC);
CREATE INDEX idx_merchants_intake ON merchants(intake_received_at DESC);
CREATE INDEX idx_submissions_deal ON submissions(deal_id);
CREATE INDEX idx_submissions_funder ON submissions(funder_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_documents_deal ON documents(deal_id);
CREATE INDEX idx_financial_snapshots_merchant ON financial_snapshots(merchant_id);
CREATE INDEX idx_activity_log_deal ON activity_log(deal_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX idx_inbound_emails_submission ON inbound_emails(submission_id);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER merchants_updated_at BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER funders_updated_at BEFORE UPDATE ON funders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER qualification_rules_updated_at BEFORE UPDATE ON qualification_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Activity log on stage change
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO activity_log (deal_id, agent_id, action_type, note, metadata)
    VALUES (
      NEW.id,
      NEW.assigned_agent_id,
      'stage_change',
      'Deal moved to ' || NEW.stage::text,
      jsonb_build_object('from', OLD.stage, 'to', NEW.stage)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deals_stage_change AFTER UPDATE OF stage ON deals FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- Helper: current user role from agents table (uses auth.uid(), not user_metadata)
CREATE OR REPLACE FUNCTION current_agent_role()
RETURNS agent_role AS $$
  SELECT role FROM agents WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE funders ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_mca_funders ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Agents policies
CREATE POLICY agents_select ON agents FOR SELECT TO authenticated
  USING (true);
CREATE POLICY agents_update_self ON agents FOR UPDATE TO authenticated
  USING (id = auth.uid() OR current_agent_role() = 'admin');
CREATE POLICY agents_admin_all ON agents FOR ALL TO authenticated
  USING (current_agent_role() = 'admin');

-- Team visibility: all authenticated agents see merchants/deals/submissions/docs/activity
CREATE POLICY merchants_all ON merchants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY deals_all ON deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY financial_snapshots_all ON financial_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY submissions_all ON submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY documents_all ON documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY activity_log_all ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY inbound_emails_select ON inbound_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY funders_all ON funders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY known_mca_funders_all ON known_mca_funders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY qualification_rules_select ON qualification_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY qualification_rules_admin ON qualification_rules FOR ALL TO authenticated
  USING (current_agent_role() = 'admin') WITH CHECK (current_agent_role() = 'admin');
CREATE POLICY email_templates_all ON email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Commissions: agent sees own; team_lead sees team; admin sees all
CREATE POLICY commissions_select ON commissions FOR SELECT TO authenticated
  USING (
    agent_id = auth.uid()
    OR current_agent_role() = 'admin'
    OR (
      current_agent_role() = 'team_lead'
      AND agent_id IN (SELECT id FROM agents WHERE team_lead_id = auth.uid())
    )
  );
CREATE POLICY commissions_admin_write ON commissions FOR ALL TO authenticated
  USING (current_agent_role() = 'admin') WITH CHECK (current_agent_role() = 'admin');

-- Notifications: own only
CREATE POLICY notifications_own ON notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Storage bucket (run separately in dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('deal-documents', 'deal-documents', false);

-- Default qualification rules
INSERT INTO qualification_rules (name, min_statement_months, max_statement_months, min_true_monthly_deposits, max_dti_percent, max_negative_balance_days)
VALUES ('default', 3, 4, 10000, 35, 5);

-- Seed known MCA funder patterns (editable in admin)
INSERT INTO known_mca_funders (name, match_patterns) VALUES
  ('Pearl Capital', ARRAY['PEARL', 'PEARL CAP']),
  ('Forward Financing', ARRAY['FORWARD FIN', 'FORWARD FINANCING']),
  ('Kapitus', ARRAY['KAPITUS', 'STRATEGIC FUNDING']),
  ('Credibly', ARRAY['CREDIBLY']),
  ('Rapid Finance', ARRAY['RAPID FIN', 'RAPID ADVANCE']),
  ('OnDeck', ARRAY['ONDECK', 'ON DECK']),
  ('Fundbox', ARRAY['FUNDBOX']);

-- Default proposal email template
INSERT INTO email_templates (name, subject_template, body_template, is_default) VALUES (
  'Default MCA Submission',
  'Submission: {{business_name}} — ${{requested_amount}}',
  E'Please find attached submission for {{business_name}}.\n\nOwner: {{owner_full_name}}\nMonthly Revenue: ${{monthly_revenue}}\nTime in Business: {{time_in_business}} months\nIndustry: {{industry}}\nFICO: {{fico}}\nRequested: ${{requested_amount}}\n\nDocuments attached.',
  true
);
