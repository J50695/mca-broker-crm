-- Rich lender criteria for auto-matching (from ISO guideline PDFs)

ALTER TABLE funders
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS guidelines JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_advance NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_funders_slug ON funders(slug);
