-- MTD is advisory only (after day 15); full months still gate submission.

ALTER TABLE financial_snapshots
  ADD COLUMN IF NOT EXISTS mtd_recommended BOOLEAN NOT NULL DEFAULT false;
