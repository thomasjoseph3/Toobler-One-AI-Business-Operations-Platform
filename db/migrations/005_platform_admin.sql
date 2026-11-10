-- F01, slice 2b: the platform admin flag.
--
-- A platform admin is a person from the Toobler team, not a business owner. For now the flag unlocks ONE thing: adding
-- industries (owner decision, 10 Nov 2026). It is false for everyone, and nothing in the app can turn it on: it is set
-- by someone with database access (a line of SQL), so a business owner can never promote themselves.

ALTER TABLE app.users ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

-- Defence in depth. Business work runs as the app role (app_user) inside a business's fence, and a bug there must never be
-- able to switch this flag on. So the app role is limited to the columns it legitimately needs on `users`: the flag is not
-- among them. (Migration 001 had given it the whole table.) A later migration that adds a column to users must grant it
-- here, on purpose.
REVOKE INSERT, UPDATE ON app.users FROM app_user;
GRANT INSERT (id, account_id, email, name, mobile_e164, mobile_key, role, status, last_login_at,
              created_by, updated_by, created_at, updated_at) ON app.users TO app_user;
GRANT UPDATE (name, mobile_e164, mobile_key, role, status, last_login_at, updated_by, updated_at)
  ON app.users TO app_user;
