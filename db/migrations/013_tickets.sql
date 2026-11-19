-- F14 slice 0: tickets (requests that are not sales) and their notes.
--
-- A ticket belongs to one contact and may have an owner (a person of the SAME business, checked by the composite key, as for
-- leads). Status is open or done. Notes are written once and never edited (an audit trail until the timeline, F07).

CREATE TABLE app.tickets (
  id                    uuid PRIMARY KEY,
  account_id            uuid        NOT NULL REFERENCES app.accounts (id),
  contact_id            uuid        NOT NULL REFERENCES app.contacts (id),
  -- A short line saying what this is about ("Refund for the December booking")
  title                 text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  details               text        CHECK (length(details) <= 2000),
  type                  text        NOT NULL DEFAULT 'other'
                                    CHECK (type IN ('callback', 'question', 'complaint', 'existing_customer', 'other')),
  priority              text        NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status                text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  owner_user_id         uuid,
  -- Which conversation type raised it (set by the router, F15); empty for tickets added by hand
  conversation_type_key text        CHECK (length(conversation_type_key) <= 80),
  -- Set when the ticket is closed; cleared if it is reopened
  closed_at             timestamptz,
  closed_by             jsonb,
  created_by            jsonb,
  updated_by            jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_owner_same_business_fkey
    FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id),
  -- Done means closed, open means not closed
  CONSTRAINT tickets_status_matches_closed_at CHECK ((status = 'done') = (closed_at IS NOT NULL)),
  -- Lets a note point at a ticket of the same business only
  CONSTRAINT tickets_account_and_id UNIQUE (account_id, id)
);
-- The list: per business, by status, newest first
CREATE INDEX tickets_list ON app.tickets (account_id, status, created_at DESC, id DESC);
-- A contact's tickets
CREATE INDEX tickets_by_contact ON app.tickets (account_id, contact_id, created_at DESC);
-- "My tickets" for a person
CREATE INDEX tickets_by_owner ON app.tickets (account_id, owner_user_id);
CREATE TRIGGER tickets_set_updated_at BEFORE UPDATE ON app.tickets
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.tickets');

-- Defence in depth: business code can add tickets and change the editable columns only. It can never delete a ticket and
-- never change the business, the contact or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.tickets FROM app_user;
GRANT INSERT (id, account_id, contact_id, title, details, type, priority, status, owner_user_id, conversation_type_key,
              created_by, updated_by, created_at, updated_at)
  ON app.tickets TO app_user;
GRANT UPDATE (title, details, type, priority, status, owner_user_id, closed_at, closed_by, updated_by, updated_at)
  ON app.tickets TO app_user;

CREATE TABLE app.ticket_notes (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  ticket_id  uuid        NOT NULL,
  body       text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_notes_same_business_fkey
    FOREIGN KEY (account_id, ticket_id) REFERENCES app.tickets (account_id, id)
);
CREATE INDEX ticket_notes_by_ticket ON app.ticket_notes (account_id, ticket_id, created_at, id);
SELECT app.enable_tenant_rls('app.ticket_notes');
-- A note is written once: never edited, never deleted
REVOKE UPDATE, DELETE ON app.ticket_notes FROM app_user;
