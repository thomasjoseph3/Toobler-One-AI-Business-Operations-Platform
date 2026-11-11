-- F04: contacts, the people a business deals with.
--
-- This migration is final before it is applied: slices 2 and 3 (read one, change, soft delete) need no further change.
-- Left out on purpose until their feature: company_id (F05), custom fields (F09), notes (F07), owner (F02).

CREATE TABLE app.contacts (
  id              uuid PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  name            text        CHECK (length(name) BETWEEN 1 AND 120),
  -- International form, like +919847012345 (checked by the app with libphonenumber-js)
  phone           text        CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  -- The digits of `phone`, for matching. Generated, so it can never drift from `phone` (owner decision R35: the full
  -- international number, not the last 10 digits).
  phone_key       text        GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  email           text        CHECK (email = lower(email) AND length(email) <= 254),
  -- The customer's language as a two-letter code (en, ml, hi...)
  language        text        CHECK (language ~ '^[a-z]{2}$'),
  lifecycle_stage text        NOT NULL DEFAULT 'new'
                              CHECK (lifecycle_stage IN ('new', 'lead', 'customer', 'repeat_customer', 'not_a_fit')),
  -- Soft delete: a deleted contact keeps its row (and its history); it just stops showing up
  deleted_at      timestamptz,
  created_by      jsonb,
  updated_by      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- A contact must be reachable: a phone or an email
  CONSTRAINT contacts_needs_phone_or_email CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Two live contacts of one business never share a phone or an email. Deleted contacts do not count, so a number can be
-- used again after its contact is deleted.
CREATE UNIQUE INDEX contacts_phone_unique ON app.contacts (account_id, phone_key)
  WHERE deleted_at IS NULL AND phone_key IS NOT NULL;
CREATE UNIQUE INDEX contacts_email_unique ON app.contacts (account_id, email)
  WHERE deleted_at IS NULL AND email IS NOT NULL;
-- The list: newest changes first, per business
CREATE INDEX contacts_list ON app.contacts (account_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON app.contacts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.contacts');

-- Defence in depth, as for `users` and `account_modules`: business code (the app role) can add contacts and change the
-- editable columns only. It can never delete a row (delete is soft) and never change the business or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.contacts FROM app_user;
GRANT INSERT (id, account_id, name, phone, email, language, lifecycle_stage, created_by, updated_by, created_at, updated_at)
  ON app.contacts TO app_user;
GRANT UPDATE (name, phone, email, language, lifecycle_stage, deleted_at, updated_by, updated_at)
  ON app.contacts TO app_user;
