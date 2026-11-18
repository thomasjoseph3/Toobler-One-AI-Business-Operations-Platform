-- F11 slice 5: static contact lists. A fixed group of contacts ("Diwali offer 2026"), saved from any contacts view or built by hand. Phase 4 campaigns use them.
-- "Static" means the members are chosen once: a contact who later stops matching the view stays in the list until someone takes them out.

CREATE TABLE app.contact_lists (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contact_lists_account_and_id UNIQUE (account_id, id)
);
-- A business never has two lists with the same name, whatever the capitals
CREATE UNIQUE INDEX contact_lists_name_unique ON app.contact_lists (account_id, lower(name));
CREATE TRIGGER contact_lists_set_updated_at BEFORE UPDATE ON app.contact_lists
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.contact_lists');

CREATE TABLE app.contact_list_members (
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  list_id    uuid        NOT NULL,
  contact_id uuid        NOT NULL REFERENCES app.contacts (id),
  added_by   jsonb,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, contact_id),
  -- A list's members must belong to the same business as the list; a deleted list takes its member rows with it
  CONSTRAINT contact_list_members_same_business_fkey
    FOREIGN KEY (account_id, list_id) REFERENCES app.contact_lists (account_id, id) ON DELETE CASCADE
);
CREATE INDEX contact_list_members_by_contact ON app.contact_list_members (account_id, contact_id);
SELECT app.enable_tenant_rls('app.contact_list_members');

-- Business code adds and renames lists, adds and removes members, and deletes lists (a list is not history). It never changes the business of a row.
REVOKE UPDATE ON app.contact_lists FROM app_user;
GRANT UPDATE (name, updated_by, updated_at) ON app.contact_lists TO app_user;
REVOKE UPDATE ON app.contact_list_members FROM app_user;
