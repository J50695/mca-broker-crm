-- Submission-first pipeline stages (enum values must be committed before use in UPDATE)
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'ready_to_submit';
ALTER TYPE deal_stage ADD VALUE IF NOT EXISTS 'needs_stipulations';
