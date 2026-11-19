-- F02 slice 1: invitations (a manager invites a person to the business).
--
-- The manager types a name, email, mobile and role; we email a single-use link. Only a HASH of the link is stored. The person opens the
-- link, chooses a password and becomes a user of the business (slice 2). One open invitation per email per business, so inviting the same
-- address twice replaces nothing and says so. A used, cancelled or expired invitation is kept as history.
-- Business code (the fenced app role) adds invitations and can only cancel or mark them; accepting runs on the owner connection because the
-- person is not signed in yet and the link is found without knowing the business.

CREATE TABLE app.invitations (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  email       text        NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  name        text        NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  mobile_e164 text,
  mobile_key  text,
  role        text        NOT NULL CHECK (role IN ('manager', 'staff', 'staff_own')),
  token_hash  text        NOT NULL,
  invited_by  uuid        NOT NULL,
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_invited_by_same_business_fkey
    FOREIGN KEY (account_id, invited_by) REFERENCES app.users (account_id, id),
  CONSTRAINT invitations_account_and_id UNIQUE (account_id, id)
);
CREATE UNIQUE INDEX invitations_token_hash_unique ON app.invitations (token_hash);
-- One open invitation per address and business
CREATE UNIQUE INDEX invitations_one_open_per_email ON app.invitations (account_id, email)
  WHERE accepted_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX invitations_by_account ON app.invitations (account_id, created_at DESC);
CREATE TRIGGER invitations_set_updated_at BEFORE UPDATE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.invitations');

REVOKE INSERT, UPDATE, DELETE ON app.invitations FROM app_user;
GRANT INSERT (id, account_id, email, name, mobile_e164, mobile_key, role, token_hash, invited_by, expires_at, created_at, updated_at)
  ON app.invitations TO app_user;
GRANT UPDATE (token_hash, expires_at, cancelled_at, updated_at) ON app.invitations TO app_user;
