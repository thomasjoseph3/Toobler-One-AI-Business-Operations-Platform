-- F11 slice 2: saved views. A person filters and sorts a list (the Leads list first), gives the result a name ("My hot leads") and finds it again as
-- a tab. A view belongs to the person who saved it; slice 3 lets a manager share one with the whole team.
-- The filters are kept as the list's own filter words (for leads: status, stage, owner "me"), checked by the API for the object; `sort_field` and
-- `sort_order` and `layout` are the list's sort and how it is drawn (a table or the pipeline board).

CREATE TABLE app.saved_views (
  id            uuid PRIMARY KEY,
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  object        text        NOT NULL CHECK (object IN ('lead')),
  name          text        NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  filters       jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filters) = 'object'),
  sort_field    text        CHECK (length(sort_field) <= 40),
  sort_order    text        CHECK (sort_order IN ('asc', 'desc')),
  layout        text        NOT NULL DEFAULT 'list' CHECK (layout IN ('list', 'pipeline')),
  -- The person who saved it
  owner_user_id uuid        NOT NULL,
  -- True when a manager has shared it with the whole team
  shared        boolean     NOT NULL DEFAULT false,
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_views_account_and_id UNIQUE (account_id, id),
  CONSTRAINT saved_views_owner_fkey FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id)
);
-- One person never has two views of one list with the same name (capitals do not matter)
CREATE UNIQUE INDEX saved_views_name_unique ON app.saved_views (account_id, owner_user_id, object, lower(name));
CREATE INDEX saved_views_list ON app.saved_views (account_id, object, created_at);
CREATE TRIGGER saved_views_set_updated_at BEFORE UPDATE ON app.saved_views
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.saved_views');

-- Business code can add views, change the editable columns and delete a view (a view is not history). It can never change the business, the list or the owner.
REVOKE UPDATE ON app.saved_views FROM app_user;
GRANT UPDATE (name, filters, sort_field, sort_order, layout, shared, updated_by, updated_at) ON app.saved_views TO app_user;
