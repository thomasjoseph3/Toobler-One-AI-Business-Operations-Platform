-- F06 slice 9: who takes part when new leads are shared out in turn (round-robin).
--
-- Until teams exist (F02) the manager names the people. The leads module may not read the users table (the auth module owns
-- it, and auth already requires leads), so the list is kept here, and the database checks that every person works for the
-- same business, exactly as it does for a lead's owner (migration 011).

CREATE TABLE app.assignment_rule_people (
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  user_id    uuid        NOT NULL,
  -- The order of the turns: the person with the lowest number is first
  sort       integer     NOT NULL CHECK (sort >= 0),
  created_by jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id),
  CONSTRAINT assignment_rule_people_same_business_fkey
    FOREIGN KEY (account_id, user_id) REFERENCES app.users (account_id, id)
);
SELECT app.enable_tenant_rls('app.assignment_rule_people');
-- A list is replaced by deleting and adding rows; a row is never edited
REVOKE UPDATE ON app.assignment_rule_people FROM app_user;

-- The rule's own people must also work for the same business (they only had to exist before).
ALTER TABLE app.assignment_rules DROP CONSTRAINT assignment_rules_user_id_fkey;
ALTER TABLE app.assignment_rules DROP CONSTRAINT assignment_rules_last_assigned_user_id_fkey;
ALTER TABLE app.assignment_rules ADD CONSTRAINT assignment_rules_user_same_business_fkey
  FOREIGN KEY (account_id, user_id) REFERENCES app.users (account_id, id);
ALTER TABLE app.assignment_rules ADD CONSTRAINT assignment_rules_last_assigned_same_business_fkey
  FOREIGN KEY (account_id, last_assigned_user_id) REFERENCES app.users (account_id, id);
