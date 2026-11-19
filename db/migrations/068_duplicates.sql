-- F13: duplicates and merging.
--
-- 1. `duplicate_suggestions`: a pair of contacts, or a pair of companies, that the nightly job thinks are probably the same. `a_id` is always the
--    smaller id, so a pair is stored once whichever way round it is found. A pair staff dismissed ("Not the same") stays with status 'dismissed' and
--    is never made open again. The two ids point at contacts or at companies depending on `object`, so they cannot be plain foreign keys.
-- 2. `contacts.merged_into_id` and `companies.merged_into_id`: a record merged into another is NOT removed (business code never deletes a row). It is
--    marked deleted and points at the record it was merged into, so both originals stay (the same pattern as unanswered_questions.merged_into_id).
-- 3. Business code could never change the contact of a lead, ticket, task or note (migrations 010, 013, 048 and 050 promised it). A merge has to,
--    so `UPDATE (contact_id)` is now granted on those four tables. Only each owning module's merge function does this.

CREATE TABLE app.duplicate_suggestions (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  object      text        NOT NULL CHECK (object IN ('contact', 'company')),
  a_id        uuid        NOT NULL,
  b_id        uuid        NOT NULL,
  -- Why they look the same, as short keys the screen turns into words (for example 'same_name_similar_phone')
  reasons     text[]      NOT NULL CHECK (cardinality(reasons) BETWEEN 1 AND 6),
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'merged')),
  -- Who decided and when (a person, for 'dismissed' and 'merged')
  decided_by  jsonb,
  decided_at  timestamptz,
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_suggestions_ordered CHECK (a_id < b_id),
  CONSTRAINT duplicate_suggestions_decided CHECK ((status = 'open') = (decided_at IS NULL)),
  CONSTRAINT duplicate_suggestions_pair_unique UNIQUE (account_id, object, a_id, b_id)
);
-- The list of open pairs for one kind of record
CREATE INDEX duplicate_suggestions_open ON app.duplicate_suggestions (account_id, object, created_at, id) WHERE status = 'open';
-- "Which suggestions mention this record?" (a merged-away record closes them)
CREATE INDEX duplicate_suggestions_by_b ON app.duplicate_suggestions (account_id, object, b_id);
CREATE TRIGGER duplicate_suggestions_set_updated_at BEFORE UPDATE ON app.duplicate_suggestions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.duplicate_suggestions');

-- Business code adds suggestions and decides them. It never removes one and never changes the business, the kind or the pair.
REVOKE INSERT, UPDATE, DELETE ON app.duplicate_suggestions FROM app_user;
GRANT INSERT (id, account_id, object, a_id, b_id, reasons, created_by, updated_by, created_at, updated_at)
  ON app.duplicate_suggestions TO app_user;
GRANT UPDATE (reasons, status, decided_by, decided_at, updated_by, updated_at) ON app.duplicate_suggestions TO app_user;

-- Contacts and companies: the record they were merged into (only a deleted record has one)
ALTER TABLE app.contacts ADD COLUMN merged_into_id uuid;
ALTER TABLE app.contacts ADD CONSTRAINT contacts_account_and_id UNIQUE (account_id, id);
ALTER TABLE app.contacts ADD CONSTRAINT contacts_merged_into_same_business_fkey
  FOREIGN KEY (account_id, merged_into_id) REFERENCES app.contacts (account_id, id);
ALTER TABLE app.contacts ADD CONSTRAINT contacts_not_merged_into_itself
  CHECK (merged_into_id IS NULL OR (merged_into_id <> id AND deleted_at IS NOT NULL));
GRANT UPDATE (merged_into_id) ON app.contacts TO app_user;

ALTER TABLE app.companies ADD COLUMN merged_into_id uuid;
ALTER TABLE app.companies ADD CONSTRAINT companies_merged_into_same_business_fkey
  FOREIGN KEY (account_id, merged_into_id) REFERENCES app.companies (account_id, id);
ALTER TABLE app.companies ADD CONSTRAINT companies_not_merged_into_itself
  CHECK (merged_into_id IS NULL OR (merged_into_id <> id AND deleted_at IS NOT NULL));
GRANT UPDATE (merged_into_id) ON app.companies TO app_user;

-- A merge moves the loser's leads, tickets, tasks and notes to the kept contact (conversations already allow it)
GRANT UPDATE (contact_id) ON app.leads TO app_user;
GRANT UPDATE (contact_id) ON app.tickets TO app_user;
GRANT UPDATE (contact_id) ON app.tasks TO app_user;
GRANT UPDATE (contact_id) ON app.activities TO app_user;
