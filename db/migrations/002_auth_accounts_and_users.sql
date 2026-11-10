-- F01: businesses, the people in them, and sign-in.
--
-- Two kinds of table:
--  * fenced (RLS forced, like every business table): accounts (by its own id) and users (by account_id)
--  * global, and closed to the app role (app_user): user_credentials, sessions, auth_tokens, login_attempts. They are
--    needed before a business is known (signing in), so only the owner connection reaches them, through named
--    repository functions in modules/core/auth. A fenced query can never read a password hash or a session.

-- The business itself. Its own policy, because it has `id`, not `account_id`.
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

-- A person in a business. One email manages one business for now (owner decision, 10 Nov 2026): when a person needs
-- several businesses, a memberships table replaces account_id here.
CREATE TABLE app.users (
  id                uuid PRIMARY KEY,
  account_id        uuid        NOT NULL REFERENCES app.accounts (id),
  email             text        NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  name              text        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  mobile_e164       text,
  mobile_key        text,
  role              text        NOT NULL CHECK (role IN ('manager', 'staff', 'staff_own')),
  email_verified_at timestamptz,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login_at     timestamptz,
  created_by        jsonb,
  updated_by        jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- One email, one account, across all businesses
CREATE UNIQUE INDEX users_email_unique ON app.users (email);
CREATE INDEX users_by_account ON app.users (account_id);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.users');

-- The secret part of a person, kept apart from the profile
CREATE TABLE app.user_credentials (
  user_id             uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  password_hash       text        NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);

-- One sign-in on one device. The refresh token is stored only as a hash and replaced at every refresh; the previous
-- hash is kept for a minute so two requests refreshing at once do not look like theft.
CREATE TABLE app.sessions (
  id                          uuid PRIMARY KEY,
  user_id                     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  refresh_token_hash          text        NOT NULL UNIQUE,
  previous_refresh_token_hash text,
  rotated_at                  timestamptz,
  user_agent                  text,
  ip                          text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  last_used_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL,
  revoked_at                  timestamptz,
  revoked_reason              text
);
CREATE INDEX sessions_by_user ON app.sessions (user_id);
CREATE INDEX sessions_by_previous_hash ON app.sessions (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;

-- Single-use links sent by email (verify the address, reset the password), stored only as a hash
CREATE TABLE app.auth_tokens (
  id          uuid PRIMARY KEY,
  kind        text        NOT NULL CHECK (kind IN ('email_verify', 'password_reset')),
  user_id     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  secret_hash text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_by_user ON app.auth_tokens (user_id, kind);

-- Failed sign-in counters, keyed by a hash of the email so an unknown email behaves exactly like a known one
CREATE TABLE app.login_attempts (
  key_hash     text PRIMARY KEY,
  failed_count integer     NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Migration 001 gives app_user access to every new table by default. These four must stay closed to it.
REVOKE ALL ON app.user_credentials, app.sessions, app.auth_tokens, app.login_attempts FROM app_user;
