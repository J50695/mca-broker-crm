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
-- Storage policies for deal documents bucket
-- Create bucket in Supabase Dashboard: deal-documents (private)

CREATE POLICY "Authenticated users can read deal documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can upload deal documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can update deal documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'deal-documents')
WITH CHECK (bucket_id = 'deal-documents');

CREATE POLICY "Authenticated users can delete deal documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'deal-documents');

-- Enable realtime for live board updates
ALTER PUBLICATION supabase_realtime ADD TABLE deals;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE financial_snapshots;
-- Rich lender criteria for auto-matching (from ISO guideline PDFs)

ALTER TABLE funders
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_advance NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_funders_slug ON funders(slug);
-- Auto-create agent profile when a user signs up (links auth.users → agents)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agents (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    CASE
      WHEN (SELECT count(*) FROM public.agents) = 0 THEN 'admin'::agent_role
      ELSE 'agent'::agent_role
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Lender roster seeded from ISO guideline PDFs (June 2025)
-- Source PDFs: docs/lender-sources/

DELETE FROM funders WHERE slug IN (
  'ondeck', 'mulligan', 'iou-financial', 'newport-bc', 'fintap', 'forward-financing', 'everest'
);

INSERT INTO funders (
  slug, name, min_fico, min_monthly_revenue, min_time_in_business_months,
  excluded_industries, max_factor_rate, max_advance, typical_turnaround_days,
  contact_email, email_domain, submission_method, is_active, guidelines
) VALUES

-- OnDeck (ondeck 25.pdf)
(
  'ondeck',
  'OnDeck',
  625,
  8333.33,
  12,
  ARRAY[
    'trucking', 'law', 'legal', 'lawyer', 'lawyers', 'attorney'
  ],
  1.50,
  250000,
  2,
  'partnersupport@ondeck.com',
  'ondeck.com',
  'portal',
  true,
  '{
    "product": "term_loan_and_loc",
    "sweet_spot": {"min_fico": 675, "min_monthly_revenue": 25000, "min_tib_months": 24, "min_avg_daily_balance": 3000},
    "min_avg_daily_balance": 1000,
    "bank_statements_months": 3,
    "max_existing_mca_payoffs": 2,
    "max_tax_liens": 100000,
    "no_bankruptcy_years": 2,
    "decision_hours": 2,
    "funding_days": "1-2",
    "positions": "1st",
    "notes": "Submit via Partner Portal. Docs to docs@ondeck.com. Ineligible industries list on partner portal."
  }'::jsonb
),

-- Mulligan Funding (Mulligan Guidelines.pdf)
(
  'mulligan',
  'Mulligan Funding',
  625,
  62500,
  6,
  ARRAY[
    'nonprofit', 'non-profit', 'trucking', 'transportation', 'logistics', 'freight',
    'legal', 'law', 'attorney', 'financial services', 'bank', 'credit union', 'lender',
    'insurance', 'real estate', 'gambling', 'cannabis', 'marijuana', 'cbd', 'vape',
    'adult entertainment', 'pawn', 'collection', 'payroll', 'crypto', 'atm',
    'trucking', 'auto sales', 'gun', 'firearm', 'travel agency', 'hotel', 'motel'
  ],
  NULL,
  5000000,
  1,
  'partner@mulliganfunding.com',
  'mulliganfunding.com',
  'email',
  true,
  '{
    "product": "business_loan",
    "min_annual_revenue": 750000,
    "terms_months": "3-24",
    "positions": "1st_only",
    "bank_statements_months": 3,
    "tax_returns_over_350k": true,
    "soft_pull_only": true,
    "all_50_states": true,
    "construction_min_fico": 675,
    "notes": "1st position only. Funding up to $5MM. Commission paid day after funding."
  }'::jsonb
),

-- IOU Financial (iou 2025.pdf) — Core tier baseline for matching
(
  'iou-financial',
  'IOU Financial',
  650,
  8000,
  12,
  ARRAY[
    'adult entertainment', 'rehab', 'ambulance', 'atm', 'attorney', 'legal', 'law',
    'bail bonding', 'bank', 'credit union', 'mortgage', 'collection', 'school', 'college',
    'construction ground-up', 'debt reduction', 'tax reduction', 'energy', 'factoring',
    'farming', 'gym', 'fitness', 'flea market', 'supplement', 'holistic', 'home healthcare',
    'hookah', 'fortune telling', 'investment', 'logistics', 'freight', 'lottery', 'gambling',
    'marijuana', 'mining', 'pawn', 'money services', 'nonprofit', 'staffing', 'oil gas',
    'payday', 'precious metal', 'real estate', 'roofing', 'solar', 'stock brokerage',
    'tax preparer', 'taxi', 'limo', 'towing', 'transportation', 'trucking', 'used car',
    'vape', 'vehicle manufacturing', 'wireless'
  ],
  1.35,
  150000,
  3,
  'submissions@ioufinancial.com',
  'ioufinancial.com',
  'email',
  true,
  '{
    "product": "core",
    "tiers": {
      "core": {"min": 15000, "max": 150000, "min_fico": 650, "min_tib_months": 12, "min_adb": 3000},
      "mid_market": {"min": 150001, "max": 300000, "min_fico": 650, "min_tib_months": 24},
      "premier": {"min": 300001, "max": 850000, "min_fico": 700, "min_tib_months": 60},
      "premier_plus": {"min": 500000, "max": 1500000, "min_fico": 700, "min_tib_months": 60}
    },
    "positions": "1st_and_2nd",
    "bank_statements_months": 3,
    "min_deposits_per_month": 8,
    "excluded_states": ["MT", "NV", "SD", "VT", "HI", "ND"],
    "ca_license_required": true,
    "notes": "Core product used for baseline matching. 2nd position adds +1 to buy rate."
  }'::jsonb
),

-- Newport Business Capital (newport 2025.pdf)
(
  'newport-bc',
  'Newport Business Capital',
  500,
  20000,
  9,
  ARRAY[
    'sole proprietorship', 'sole proprietor', 'consulting', 'farm', 'gas station',
    'adult entertainment', 'cannabis', 'trucking broker', 'logistics broker',
    'financial services', 'investing', 'tax consulting', 'real estate', 'property management',
    'home based ecommerce', 'home based retail', 'nail salon', 'law firm', 'legal',
    'collection', 'insurance', 'auto sales', 'event planner', 'venue', 'security',
    'entertainment production'
  ],
  NULL,
  200000,
  2,
  'submissions@newportbc.com',
  'newportbc.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_months": "7-12",
    "positions": "1st_only",
    "min_avg_daily_balance": 2000,
    "min_deposits_per_month": 5,
    "max_negative_days_with_od": 3,
    "max_negative_days_without_od": 1,
    "no_sole_proprietorships": true,
    "no_open_bankruptcy": true,
    "bankruptcy_satisfied_months": 6,
    "max_competitor_consolidation": 1,
    "min_net_after_payoff_percent": 65,
    "excluded_states": ["VA", "UT"],
    "origination_fee_percent": 3.5,
    "max_commission_points": 10,
    "notes": "CC kborth@newportbc.com on submissions. Weekly ACH typical."
  }'::jsonb
),

-- FinTap (fintap 2025.pdf)
(
  'fintap',
  'FinTap',
  600,
  20000,
  24,
  ARRAY[
    'auto sales', 'legal', 'law', 'attorney', 'financial services', 'thc', 'cannabis'
  ],
  1.50,
  1000000,
  3,
  'submissions@fintap.com',
  'fintap.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_weeks": "24-48",
    "max_commission_points": 15,
    "buy_rate_start": 1.25,
    "min_fico_new_1st_no_mca_history": 650,
    "min_tib_new_1st_no_mca_history": 48,
    "max_negative_days_3mo": 6,
    "high_risk_min_monthly_revenue": 50000,
    "high_risk_industries": ["trucking", "construction", "farm"],
    "positions": "1st_to_3rd",
    "focus": "clean_2nd_and_3rd",
    "buyout_net_percent": 50,
    "excluded_states_registration": ["VA", "MO"],
    "notes": "CC BD rep on submissions. Vantage score used."
  }'::jsonb
),

-- Forward Financing (Forward Intro Kit)
(
  'forward-financing',
  'Forward Financing',
  500,
  10000,
  12,
  ARRAY[
    'adult entertainment', 'auto sales', 'auction', 'lottery', 'gaming', 'gambling',
    'bail bonds', 'mlm', 'multi-level marketing', 'cannabis', 'nonprofit', 'non-profit',
    'religious', 'drug paraphernalia', 'pawn', 'firearms', 'guns', 'ammunition',
    'precious metals', 'crypto', 'cryptocurrency', 'lending', 'financing', 'publicly traded',
    'debt collection', 'bankruptcy lawyer', 'real estate investment', 'check cashing',
    'money wiring', 'oil gas'
  ],
  1.595,
  300000,
  2,
  'submissions@forwardfinancing.com',
  'forwardfinancing.com',
  'email',
  true,
  '{
    "product": "revenue_based_financing",
    "terms_months": "3-12",
    "positions": "2nd_and_3rd",
    "bc_paper": true,
    "max_total_gross_reserve_percent": 40,
    "max_negative_days_per_month": 5,
    "no_declines_last_30_days": true,
    "no_late_mortgage_2mo": true,
    "no_dismissed_bankruptcy_1yr": true,
    "strict_tib": "12_months_minimum_no_rounding",
    "bank_statements_months": 3,
    "notes": "Do NOT submit 10-11 month TIB files. 1st positions with challenged credit considered case-by-case."
  }'::jsonb
),

-- Everest Business Funding (everest 2025.pdf — vision extract)
(
  'everest',
  'Everest Business Funding',
  500,
  5000,
  3,
  ARRAY[
    'financial institution', 'financial services', 'bank', 'credit union', 'lender',
    'auto sales', 'automobile', 'car dealer', 'attorney', 'attorneys', 'legal', 'law',
    'transportation', 'trucking', 'logistics', 'freight'
  ],
  1.30,
  NULL,
  2,
  'newdeals@ev-bf.com',
  'ev-bf.com',
  'email',
  true,
  '{
    "product": "mca",
    "terms_months": 12,
    "min_advance": 5000,
    "max_negative_days": 5,
    "max_nsf": 5,
    "buy_rate_start": 1.15,
    "max_commission_points": 15,
    "bank_statements_months": 3,
    "business_bank_account_required": true,
    "submission_subject": "New Deal - {{business_name}}",
    "one_deal_per_email": true,
    "new_thread_per_submission": true,
    "contracts_email": "contracts@ev-bf.com",
    "renewals_email": "renewals@ev-bf.com",
    "support_email": "isosupport@ev-bf.com",
    "treasury_email": "treasury@ev-bf.com",
    "renewal_paid_percent": 50,
    "renewal_mtd_required_after_day": 15,
    "existing_mca_balance_required": true,
    "notes": "Restricted: Financial Institutions, Auto Sales, Attorneys, Transportation. Fax (888) 493-4091. ISO support (888) 342-5709."
  }'::jsonb
);

-- MCA debit name patterns (statement matching)
INSERT INTO known_mca_funders (name, match_patterns)
SELECT v.name, v.patterns
FROM (VALUES
  ('OnDeck', ARRAY['ONDECK', 'ON DECK']),
  ('Forward Financing', ARRAY['FORWARD FIN', 'FORWARD FINANCING']),
  ('Mulligan Funding', ARRAY['MULLIGAN']),
  ('IOU Financial', ARRAY['IOU FIN', 'IOU FINANCIAL']),
  ('Newport Business Capital', ARRAY['NEWPORT', 'NEWPORT BC']),
  ('FinTap', ARRAY['FINTAP', 'FIN TAP']),
  ('Everest Business Funding', ARRAY['EVEREST', 'EV-BF', 'EV BF']),
  ('Pearl Capital', ARRAY['PEARL', 'PEARL CAP']),
  ('Kapitus', ARRAY['KAPITUS', 'STRATEGIC FUNDING']),
  ('Credibly', ARRAY['CREDIBLY']),
  ('Rapid Finance', ARRAY['RAPID FIN', 'RAPID ADVANCE']),
  ('Fundbox', ARRAY['FUNDBOX'])
) AS v(name, patterns)
WHERE NOT EXISTS (
  SELECT 1 FROM known_mca_funders k WHERE k.name = v.name
);
