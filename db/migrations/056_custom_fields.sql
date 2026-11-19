-- F09 slice 1: the definitions of custom fields (what each business adds to its contacts, companies and leads).
--
-- A wedding planner adds "Wedding date" and "Guest count"; a car dealer adds "Car model". The definition says what the field is called, what kind
-- of answer it takes, and whether the AI should ask for it. The VALUES arrive in later slices, in a `custom` column on each object.
-- The key is made from the label, never changes (so renaming a label loses nothing) and is never reused, even after the field is removed: removing a
-- field archives it, and its values are kept hidden for 30 days.

CREATE TABLE app.field_definitions (
  id               uuid PRIMARY KEY,
  account_id       uuid        NOT NULL REFERENCES app.accounts (id),
  object           text        NOT NULL CHECK (object IN ('contact', 'company', 'lead')),
  key              text        NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  label            text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  type             text        NOT NULL CHECK (type IN ('text', 'number', 'date', 'dropdown', 'yes_no', 'phone', 'email')),
  -- The choices of a dropdown, in order (a list of texts); empty for every other type
  options          jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array'),
  ai_asks          boolean     NOT NULL DEFAULT false,
  required_for_won boolean     NOT NULL DEFAULT false,
  sort             integer     NOT NULL CHECK (sort >= 0),
  archived_at      timestamptz,
  created_by       jsonb,
  updated_by       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- "Required before Won" only makes sense on leads
  CONSTRAINT field_definitions_required_for_won_only_on_leads CHECK (NOT required_for_won OR object = 'lead'),
  CONSTRAINT field_definitions_account_and_id UNIQUE (account_id, id)
);
-- A key is unique per business and object for ever (archived fields keep theirs)
CREATE UNIQUE INDEX field_definitions_key_unique ON app.field_definitions (account_id, object, key);
CREATE INDEX field_definitions_list ON app.field_definitions (account_id, object, sort) WHERE archived_at IS NULL;
CREATE TRIGGER field_definitions_set_updated_at BEFORE UPDATE ON app.field_definitions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.field_definitions');

-- Defence in depth: business code adds definitions and changes the editable columns only. It never deletes a row, and never changes the business, the
-- object, the key, the type or who made it (a field's key and type are fixed for its life).
REVOKE INSERT, UPDATE, DELETE ON app.field_definitions FROM app_user;
GRANT INSERT (id, account_id, object, key, label, type, options, ai_asks, required_for_won, sort, created_by, updated_by, created_at, updated_at)
  ON app.field_definitions TO app_user;
GRANT UPDATE (label, options, ai_asks, required_for_won, sort, archived_at, updated_by, updated_at) ON app.field_definitions TO app_user;
