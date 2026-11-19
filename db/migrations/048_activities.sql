-- F07 slice 1: the activity timeline, starting with notes on a lead.
--
-- One row is one thing that happened with a person (a contact) and, usually, one of their leads. Today the only kind is `note`;
-- later slices add stage changes, calls, chats and so on (each by widening the kind check in its own migration).
-- A note on a lead also carries the lead's contact, so a contact's timeline is every row with that contact (all its leads).
-- A note belongs to the business of its lead and its writer (the composite keys check it). A note can be edited by its writer and
-- soft-deleted by a manager (slice 2); it is never removed for good.

-- Lets an activity point at a lead of the same business only (leads already have a plain primary key)
ALTER TABLE app.leads ADD CONSTRAINT leads_account_and_id UNIQUE (account_id, id);

CREATE TABLE app.activities (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  contact_id  uuid        NOT NULL REFERENCES app.contacts (id),
  lead_id     uuid,
  kind        text        NOT NULL CHECK (kind IN ('note')),
  -- The note's words
  body        text        CHECK (length(body) BETWEEN 1 AND 2000),
  -- Who wrote it: a person of the business, or an agent such as the AI (then by_user_id is empty)
  by_user_id  uuid,
  by_agent    text        CHECK (length(by_agent) <= 60),
  -- Set when the writer changes the words; set by a manager's delete
  edited_at   timestamptz,
  deleted_at  timestamptz,
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_lead_same_business_fkey
    FOREIGN KEY (account_id, lead_id) REFERENCES app.leads (account_id, id),
  CONSTRAINT activities_writer_same_business_fkey
    FOREIGN KEY (account_id, by_user_id) REFERENCES app.users (account_id, id),
  CONSTRAINT activities_note_has_body CHECK (kind <> 'note' OR body IS NOT NULL),
  CONSTRAINT activities_account_and_id UNIQUE (account_id, id)
);
-- A lead's timeline and a contact's timeline, newest first (deleted ones left out)
CREATE INDEX activities_by_lead ON app.activities (account_id, lead_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX activities_by_contact ON app.activities (account_id, contact_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER activities_set_updated_at BEFORE UPDATE ON app.activities
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.activities');

-- Defence in depth: business code can add activities, and change only the words and the edited/deleted marks. It can never remove a
-- row for good and never change the business, the contact, the lead, the kind or who wrote it.
REVOKE INSERT, UPDATE, DELETE ON app.activities FROM app_user;
GRANT INSERT (id, account_id, contact_id, lead_id, kind, body, by_user_id, by_agent, created_by, updated_by, created_at, updated_at)
  ON app.activities TO app_user;
GRANT UPDATE (body, edited_at, deleted_at, updated_by, updated_at) ON app.activities TO app_user;
