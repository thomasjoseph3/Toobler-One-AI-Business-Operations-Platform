-- F15 slice 4: the block list (docs/CONVERSATION-TYPES.md). A manager lists phone numbers and email addresses that are never
-- a customer: whoever contacts the business from one of them is treated as spam before any AI is asked (the pre-filter).
--
-- One row is one number OR one email, never both. A number is kept as its digits (the same `phone_key` form contacts use, so
-- "+91 98470 12345" and "098470 12345" are the same entry); the number with its plus is worked out from it when shown, so
-- nothing is stored twice. An email is kept in lower case. A number or an email can be on a business's list only once.

CREATE TABLE app.block_list (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  phone_key  text        CHECK (phone_key ~ '^[0-9]{5,20}$'),
  email      text        CHECK (email = lower(email) AND length(email) <= 254),
  -- Why it is blocked, for the manager's own memory
  reason     text        CHECK (length(reason) <= 200),
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of the two is given
  CONSTRAINT block_list_phone_or_email CHECK ((phone_key IS NULL) <> (email IS NULL))
);
CREATE UNIQUE INDEX block_list_phone_unique ON app.block_list (account_id, phone_key) WHERE phone_key IS NOT NULL;
CREATE UNIQUE INDEX block_list_email_unique ON app.block_list (account_id, email) WHERE email IS NOT NULL;
CREATE INDEX block_list_by_time ON app.block_list (account_id, created_at, id);
CREATE TRIGGER block_list_set_updated_at BEFORE UPDATE ON app.block_list
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.block_list');

-- Defence in depth: business code can add and remove entries and change the reason. It can never change the number, the email,
-- the business or who added it.
REVOKE INSERT, UPDATE, DELETE ON app.block_list FROM app_user;
GRANT INSERT (id, account_id, phone_key, email, reason, created_by, updated_by, created_at, updated_at)
  ON app.block_list TO app_user;
GRANT UPDATE (reason, updated_by, updated_at) ON app.block_list TO app_user;
GRANT DELETE ON app.block_list TO app_user;
