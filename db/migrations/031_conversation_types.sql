-- F15 slice 1: conversation types (docs/CONVERSATION-TYPES.md). A type is one reason a person gets in touch (new enquiry,
-- complaint, supplier, spam, ...). Each business has its own list: the system types every business gets, its industry's
-- extras, and any the manager adds. Each type decides what happens next (a lead, a ticket, a log line, the Filtered tab).
-- The rows are made on first use (the service fills in a business that has none), so new and existing businesses are alike.

CREATE TABLE app.conversation_types (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  -- Stable name used by the classifier and the router ("complaint"); the label is the business's own word for it
  key         text        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  label       text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  -- Tells the classifier what the type means; up to five short examples teach it by showing
  description text        NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  examples    jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(examples) = 'array' AND jsonb_array_length(examples) <= 5),
  -- Types every business has; they can be renamed and re-routed but never removed
  is_system   boolean     NOT NULL DEFAULT false,
  outcome     text        NOT NULL CHECK (outcome IN ('lead', 'ticket', 'log', 'filter', 'ignore', 'review')),
  -- Only for outcome 'ticket': the kind and priority of the ticket the router raises
  ticket_type text        CHECK (ticket_type IN ('callback', 'question', 'complaint', 'existing_customer', 'other')),
  priority    text        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  needs_person boolean    NOT NULL DEFAULT false,
  -- Who should be told and when: { "who": "manager", "when": "now" }; empty for none. F23 sends the alerts.
  alert       jsonb       CHECK (alert IS NULL OR jsonb_typeof(alert) = 'object'),
  -- How the AI agent carries on once the type is known (F19)
  playbook    text        NOT NULL DEFAULT 'sales' CHECK (playbook IN ('sales', 'service', 'brief_end', 'emergency')),
  is_active   boolean     NOT NULL DEFAULT true,
  sort        integer     NOT NULL DEFAULT 0,
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A ticket outcome says what kind of ticket; any other outcome says none
  CONSTRAINT conversation_types_ticket_fields CHECK (
    (outcome = 'ticket' AND ticket_type IS NOT NULL AND priority IS NOT NULL)
    OR (outcome <> 'ticket' AND ticket_type IS NULL AND priority IS NULL)
  ),
  CONSTRAINT conversation_types_key_per_business UNIQUE (account_id, key)
);
CREATE INDEX conversation_types_list ON app.conversation_types (account_id, sort, id);
CREATE TRIGGER conversation_types_set_updated_at BEFORE UPDATE ON app.conversation_types
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.conversation_types');

-- Defence in depth: business code can add types and change the editable columns only. It can never change the key, the
-- business or whether a type is a system type. (Deleting a custom type is granted with the slice that builds it.)
REVOKE INSERT, UPDATE, DELETE ON app.conversation_types FROM app_user;
GRANT INSERT (id, account_id, key, label, description, examples, is_system, outcome, ticket_type, priority, needs_person,
              alert, playbook, is_active, sort, created_by, updated_by, created_at, updated_at)
  ON app.conversation_types TO app_user;
GRANT UPDATE (label, description, examples, outcome, ticket_type, priority, needs_person, alert, playbook, is_active, sort,
              updated_by, updated_at)
  ON app.conversation_types TO app_user;
