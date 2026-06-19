-- Server-only config (service_role). Used when Edge Function secrets are unavailable.
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON app_config FROM anon, authenticated;
GRANT ALL ON app_config TO service_role;
