-- 001_kernel: the groundwork every other migration builds on.
--  * the app_user role: what business work runs as. It can NOT bypass Row Level Security.
--  * app.current_account_id(): the business the current transaction is fenced to (set by the API per transaction).
--  * app.enable_tenant_rls(table): every table with an account_id calls this once; a schema test enforces it.
--  * the event outbox and the activity log.
-- The migration runner has already created schema "app" and app.schema_migrations, and sets search_path to app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

-- The connecting (owner) user switches into app_user for business work, so it must be allowed to SET ROLE to it.
GRANT app_user TO CURRENT_USER WITH SET TRUE;

GRANT USAGE ON SCHEMA app TO app_user;
-- Tables the owner creates later are readable and writable by app_user (RLS still decides which rows).
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO app_user;

CREATE FUNCTION app.current_account_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.account_id', true), '')::uuid $$;

-- An UPDATE that sets updated_at itself keeps its value (backfills, tests); every other one stamps the time.
CREATE FUNCTION app.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN
    IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN NEW.updated_at = now(); END IF;
    RETURN NEW;
  END $$;

-- Row Level Security for a business table: enabled, forced (also for the table owner), one policy on account_id.
-- With no account set the policy matches nothing, so a forgotten fence returns no rows rather than every row.
CREATE FUNCTION app.enable_tenant_rls(tbl regclass) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (account_id = app.current_account_id()) WITH CHECK (account_id = app.current_account_id())',
    tbl);
END $$;

-- The outbox. A service writes its change and its event in one transaction; the dispatcher delivers each event to the
-- modules that subscribed, at least once (handlers must be idempotent).
CREATE TABLE app.domain_events (
  id              uuid PRIMARY KEY,
  account_id      uuid NOT NULL,
  name            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until    timestamptz,
  last_error      text,
  failed_at       timestamptz
);
CREATE INDEX domain_events_pending ON app.domain_events (next_attempt_at)
  WHERE dispatched_at IS NULL AND failed_at IS NULL;
SELECT app.enable_tenant_rls('app.domain_events');

-- Who did what, when. Field names only, never values. The app role can add rows and read them, never change or delete.
CREATE TABLE app.activity_log (
  id          uuid PRIMARY KEY,
  account_id  uuid NOT NULL,
  actor       jsonb NOT NULL,
  kind        text NOT NULL,
  record_type text,
  record_id   uuid,
  fields      text[] NOT NULL DEFAULT '{}',
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_by_time ON app.activity_log (account_id, created_at DESC);
SELECT app.enable_tenant_rls('app.activity_log');
REVOKE UPDATE, DELETE ON app.activity_log FROM app_user;
