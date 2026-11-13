-- F37, slice 4: each business's AI settings (one row per business).
--
-- The MANAGER chooses where the business's AI keys come from (key_mode) and may choose its own models for a job (task_models,
-- only the jobs it overrides: any job not listed uses the platform's setting). The PLATFORM ADMIN decides whether the business may
-- use the platform's keys at all, with a monthly cap and an end date (the platform_* columns), and whether warning emails go
-- out. The columns the manager cannot touch are enforced here, not just in the code: the app role may only write its own
-- columns; the platform columns are written on the owner connection by the platform-only routes (slice 5).

CREATE TABLE app.ai_settings (
  account_id                uuid PRIMARY KEY REFERENCES app.accounts (id),
  -- own: only the business's own keys. platform: only the platform's keys (needs platform_enabled). own_then_platform: own keys
  -- first, the platform's only if all of them fail.
  key_mode                  text        NOT NULL DEFAULT 'own' CHECK (key_mode IN ('own', 'platform', 'own_then_platform')),
  -- { "<job>": ["<model id>", ...] }: the business's own order for those jobs
  task_models               jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(task_models) = 'object'),
  -- Platform-controlled (slice 5)
  platform_enabled          boolean     NOT NULL DEFAULT false,
  platform_monthly_call_cap integer     CHECK (platform_monthly_call_cap IS NULL OR platform_monthly_call_cap >= 0),
  platform_expires_at       timestamptz,
  notices_enabled           boolean     NOT NULL DEFAULT true,
  created_by                jsonb,
  updated_by                jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_settings_set_updated_at BEFORE UPDATE ON app.ai_settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.ai_settings');

-- Defence in depth: business code can create the row and change the manager's two settings. It can never change the platform's
-- columns (not even by a bug), never delete the row, and never change the business.
REVOKE INSERT, UPDATE, DELETE ON app.ai_settings FROM app_user;
GRANT INSERT (account_id, key_mode, task_models, created_by, updated_by, created_at, updated_at) ON app.ai_settings TO app_user;
GRANT UPDATE (key_mode, task_models, updated_by, updated_at) ON app.ai_settings TO app_user;
