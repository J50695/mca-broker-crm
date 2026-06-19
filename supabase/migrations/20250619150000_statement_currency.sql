-- Bank statement recency tracking + configurable max age

ALTER TABLE qualification_rules
  ADD COLUMN IF NOT EXISTS max_statement_age_days INTEGER NOT NULL DEFAULT 45;

ALTER TABLE financial_snapshots
  ADD COLUMN IF NOT EXISTS latest_statement_end_date DATE,
  ADD COLUMN IF NOT EXISTS statements_current BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS statement_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS statement_currency_notes TEXT;

UPDATE qualification_rules
SET max_statement_age_days = 45
WHERE max_statement_age_days IS NULL;
