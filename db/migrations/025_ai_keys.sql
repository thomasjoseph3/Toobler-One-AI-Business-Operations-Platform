-- F37, slice 2: the AI keys a business saves for itself.
--
-- A business can use its own account with an AI company (Gemini, OpenAI, Claude) instead of the platform's. The key is a secret:
-- it is stored ENCRYPTED (AES-256-GCM, tied to the business), shown only as its last four characters, and never logged. The
-- `key_fingerprint` is a keyed hash, used only to refuse the same key being saved twice; it cannot be turned back into the key.
-- Keys are soft deleted (the row stays, the key text is wiped) so the history stays readable.

CREATE TABLE app.ai_keys (
  id                uuid PRIMARY KEY,
  account_id        uuid        NOT NULL REFERENCES app.accounts (id),
  provider          text        NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  label             text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  -- 'v1.<iv>.<tag>.<ciphertext>': never the key itself
  encrypted_key     text        NOT NULL CHECK (length(encrypted_key) BETWEEN 1 AND 2000),
  -- The last four characters, for showing "••••3f9a"
  key_last_four     text        NOT NULL CHECK (length(key_last_four) = 4),
  key_fingerprint   text        NOT NULL CHECK (length(key_fingerprint) = 64),
  -- unchecked: never tested. working / limited / failed: the result of the last test or of real use.
  status            text        NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'working', 'limited', 'failed')),
  status_note       text        CHECK (length(status_note) <= 300),
  status_checked_at timestamptz,
  -- When the last warning email about this key was sent (so one problem sends one email a day)
  last_notice_at    timestamptz,
  deleted_at        timestamptz,
  created_by        jsonb,
  updated_by        jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_keys_account_and_id UNIQUE (account_id, id)
);
-- The same key cannot be saved twice by one business for one company
CREATE UNIQUE INDEX ai_keys_fingerprint_unique ON app.ai_keys (account_id, provider, key_fingerprint) WHERE deleted_at IS NULL;
-- The list, oldest first (the order keys are tried in)
CREATE INDEX ai_keys_in_order ON app.ai_keys (account_id, provider, created_at, id) WHERE deleted_at IS NULL;
CREATE TRIGGER ai_keys_set_updated_at BEFORE UPDATE ON app.ai_keys
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.ai_keys');

-- Defence in depth: business code can add keys and change the status columns and the label. It can never delete a row, never
-- change the encrypted key or its fingerprint (a replaced key is a new row), and never change the business or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.ai_keys FROM app_user;
GRANT INSERT (id, account_id, provider, label, encrypted_key, key_last_four, key_fingerprint, created_by, updated_by, created_at, updated_at)
  ON app.ai_keys TO app_user;
GRANT UPDATE (label, status, status_note, status_checked_at, last_notice_at, deleted_at, updated_by, updated_at)
  ON app.ai_keys TO app_user;
