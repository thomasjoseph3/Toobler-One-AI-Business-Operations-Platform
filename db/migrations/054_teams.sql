-- F02 slice 5: teams ("Sales", "Front office") and who is in them.
--
-- A team is a name and a set of people of the business. A person may be in several teams. Later features give leads out to a team in turn.
-- Teams carry no history of their own, so removing a team removes it for good (its member rows go with it); the people stay.
-- A person in a team must work for the same business (the composite keys check it).

CREATE TABLE app.teams (
  id         uuid PRIMARY KEY,
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  name       text        NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  created_by jsonb,
  updated_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_account_and_id UNIQUE (account_id, id)
);
-- One team of a name per business, whatever the capital letters
CREATE UNIQUE INDEX teams_name_unique ON app.teams (account_id, lower(name));
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON app.teams
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.teams');

CREATE TABLE app.team_members (
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  team_id    uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  created_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_team_same_business_fkey
    FOREIGN KEY (account_id, team_id) REFERENCES app.teams (account_id, id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_same_business_fkey
    FOREIGN KEY (account_id, user_id) REFERENCES app.users (account_id, id)
);
CREATE INDEX team_members_by_user ON app.team_members (account_id, user_id);
SELECT app.enable_tenant_rls('app.team_members');

-- Defence in depth: business code adds teams, renames them and removes them; it never changes the business or who made one.
REVOKE INSERT, UPDATE, DELETE ON app.teams FROM app_user;
GRANT INSERT (id, account_id, name, created_by, updated_by, created_at, updated_at) ON app.teams TO app_user;
GRANT UPDATE (name, updated_by, updated_at) ON app.teams TO app_user;
GRANT DELETE ON app.teams TO app_user;
REVOKE INSERT, UPDATE, DELETE ON app.team_members FROM app_user;
GRANT INSERT (account_id, team_id, user_id, created_by, created_at) ON app.team_members TO app_user;
GRANT DELETE ON app.team_members TO app_user;
