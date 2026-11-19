-- F31 slice 1: the owner's progress through the setup wizard. The list of steps is code (new steps are added by us, not by
-- businesses); this table only holds what the owner has marked. A step with no row is "todo". Steps that code can check for
-- itself (for example "About your business") are never stored here: their state is worked out from the answers.

CREATE TABLE app.setup_steps (
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  -- The step's key from the list in code, for example "pipeline"
  step_key    text        NOT NULL CHECK (step_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  status      text        NOT NULL CHECK (status IN ('todo', 'done', 'skipped')),
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, step_key)
);
CREATE TRIGGER setup_steps_set_updated_at BEFORE UPDATE ON app.setup_steps
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.setup_steps');

-- Defence in depth: business code can add a step row and change its status only. It can never delete a row and never change
-- the business, the step or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.setup_steps FROM app_user;
GRANT INSERT (account_id, step_key, status, created_by, updated_by, created_at, updated_at)
  ON app.setup_steps TO app_user;
GRANT UPDATE (status, updated_by, updated_at) ON app.setup_steps TO app_user;
