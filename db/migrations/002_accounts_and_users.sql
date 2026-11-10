-- F01, slice 1: a business, the people in it, and their passwords.
--
-- Three tables, three kinds of protection:
--  * accounts: the business itself. It has `id`, not `account_id`, so it gets its own forced Row Level Security policy
--    on `id`: a fenced query can only ever see its own business.
--  * users: a person in a business. It has `account_id`, so it uses the standard helper (RLS enabled and forced).
--  * user_credentials: the password hash. It is needed before a business is known (signing in), so it is NOT fenced;
--    instead the app role (app_user) is locked out of it completely. Only the owner connection, through named
--    functions in modules/core/auth, can read it. A fenced query can never see a password hash.

CREATE TABLE app.accounts (
  id         uuid PRIMARY KEY,
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  industry   text        NOT NULL DEFAULT 'general',
  time_zone  text        NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.accounts
  USING (id = app.current_account_id())
  WITH CHECK (id = app.current_account_id());
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON app.accounts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- One email manages one business for now (owner decision, 10 Nov 2026). When a person needs several businesses, a
-- memberships table replaces account_id here.
CREATE TABLE app.users (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  email       text        NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  mobile_e164 text,
  mobile_key  text,
  role        text        NOT NULL CHECK (role IN ('manager', 'staff', 'staff_own')),
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One email, one account, across all businesses
CREATE UNIQUE INDEX users_email_unique ON app.users (email);
CREATE INDEX users_by_account ON app.users (account_id);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.users');

-- The secret part of a person, kept apart from their profile
CREATE TABLE app.user_credentials (
  user_id             uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  password_hash       text        NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

-- Migration 001 gives app_user access to every new table by default. This one must stay closed to it.
REVOKE ALL ON app.user_credentials FROM app_user;
