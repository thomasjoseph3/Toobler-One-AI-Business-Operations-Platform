-- F08 slice 1: tasks (to-dos with an owner and a due time).
--
-- "Call Priya at 9 AM", "Send Rahul the brochure". A task is about a person (contact) and usually one of their leads, and has exactly one
-- owner (a person of the business). Staff create tasks, and later the AI agent creates one for every promise it makes
-- (`created_by_agent`). Completing, snoozing (a new due time), reassigning, editing and deleting arrive in the next slice, so their
-- columns and grants are made here once: `done_at`, `deleted_at`, `reminded_at` and `overdue_alerted_at` (the reminder and late alerts
-- of a later slice mark each task once).
-- A task belongs to the business of its contact, its lead and its owner (the composite keys check it).

CREATE TABLE app.tasks (
  id                  uuid PRIMARY KEY,
  account_id          uuid        NOT NULL REFERENCES app.accounts (id),
  contact_id          uuid        NOT NULL REFERENCES app.contacts (id),
  lead_id             uuid,
  kind                text        NOT NULL DEFAULT 'todo' CHECK (kind IN ('call', 'whatsapp', 'email', 'todo')),
  title               text        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  due_at              timestamptz NOT NULL,
  owner_user_id       uuid        NOT NULL,
  done_at             timestamptz,
  -- The agent that made the task (an AI promise), empty for a task a person made
  created_by_agent    text        CHECK (length(created_by_agent) <= 60),
  reminded_at         timestamptz,
  overdue_alerted_at  timestamptz,
  deleted_at          timestamptz,
  created_by          jsonb,
  updated_by          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_lead_same_business_fkey
    FOREIGN KEY (account_id, lead_id) REFERENCES app.leads (account_id, id),
  CONSTRAINT tasks_owner_same_business_fkey
    FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id),
  CONSTRAINT tasks_account_and_id UNIQUE (account_id, id)
);
-- The Tasks page: one person's open tasks by due time, and everyone's
CREATE INDEX tasks_open_by_owner ON app.tasks (account_id, owner_user_id, due_at) WHERE done_at IS NULL AND deleted_at IS NULL;
CREATE INDEX tasks_open_by_due ON app.tasks (account_id, due_at) WHERE done_at IS NULL AND deleted_at IS NULL;
-- A lead's tasks and a person's tasks
CREATE INDEX tasks_by_lead ON app.tasks (account_id, lead_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_by_contact ON app.tasks (account_id, contact_id, due_at) WHERE deleted_at IS NULL;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON app.tasks
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.tasks');

-- Defence in depth: business code adds tasks and changes only what the task screens change. It can never remove a row for good and never
-- change the business, the person, the lead or who made it.
REVOKE INSERT, UPDATE, DELETE ON app.tasks FROM app_user;
GRANT INSERT (id, account_id, contact_id, lead_id, kind, title, due_at, owner_user_id, created_by_agent, created_by, updated_by, created_at, updated_at)
  ON app.tasks TO app_user;
GRANT UPDATE (kind, title, due_at, owner_user_id, done_at, reminded_at, overdue_alerted_at, deleted_at, updated_by, updated_at)
  ON app.tasks TO app_user;
