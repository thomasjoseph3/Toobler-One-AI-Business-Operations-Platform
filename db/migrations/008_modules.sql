-- F03, slice 1: which modules (engines, channels, features) each business has.
--
-- Three switches (docs/ARCHITECTURE.md §1): `entitled` (the plan allows it; only the platform can set it) and `enabled`
-- (the business wants it; its manager sets it, and only for a module that is entitled). "Ready" (for channels: connected)
-- is not stored here; it comes with each channel. A module with no row for a business is simply not in its plan.

CREATE TABLE app.account_modules (
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  module_id   text        NOT NULL CHECK (module_id ~ '^[a-z]+\.[a-z_]+$'),
  entitled    boolean     NOT NULL DEFAULT false,
  enabled     boolean     NOT NULL DEFAULT false,
  enabled_at  timestamptz,
  disabled_at timestamptz,
  -- Per-business options of the module; each module defines its own shape (arrives with the modules that need it)
  settings    jsonb       NOT NULL DEFAULT '{}',
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, module_id),
  -- A module cannot be on when it is not in the plan
  CONSTRAINT account_modules_enabled_needs_entitlement CHECK (entitled OR NOT enabled)
);
CREATE TRIGGER account_modules_set_updated_at BEFORE UPDATE ON app.account_modules
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.account_modules');

-- Defence in depth, the same idea as the platform admin flag on `users`: business code (the app role) may switch a module on
-- or off, but must never be able to put a module into a plan. So the app role can read rows and change only these
-- columns; it cannot add rows, delete rows or touch `entitled`. Rows are added by the platform path (owner connection).
REVOKE INSERT, UPDATE, DELETE ON app.account_modules FROM app_user;
GRANT UPDATE (enabled, enabled_at, disabled_at, settings, updated_by, updated_at) ON app.account_modules TO app_user;

-- Every business that exists today gets what a new business gets: the lead engine and the website chat, on.
INSERT INTO app.account_modules (account_id, module_id, entitled, enabled, enabled_at, created_by, updated_by)
SELECT a.id, m.module_id, true, true, now(),
       '{"kind":"system","id":null}'::jsonb, '{"kind":"system","id":null}'::jsonb
FROM app.accounts a
CROSS JOIN (VALUES ('engine.leads'), ('channel.webchat')) AS m (module_id);
