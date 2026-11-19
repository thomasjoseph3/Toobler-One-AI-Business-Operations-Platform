-- F06 slice 5: two rules that the database itself enforces, so no bug in the app can break them.
--
-- 1. A lead's owner must work for the SAME business. The foreign key on its own only checks that the person exists; the
--    composite key below also checks the business (the leads module cannot read the users table, so it cannot check this itself).
-- 2. A contact has at most one open lead (open = not closed and not deleted). Two requests adding a lead for the same contact
--    at the same moment cannot both win (rule R6 in docs/REQUIREMENTS-REVIEW.md).

CREATE UNIQUE INDEX users_account_and_id ON app.users (account_id, id);

ALTER TABLE app.leads DROP CONSTRAINT leads_owner_user_id_fkey;
-- A lead with no owner (owner_user_id is null) is fine: the key is only checked when an owner is set.
ALTER TABLE app.leads ADD CONSTRAINT leads_owner_same_business_fkey
  FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id);

CREATE UNIQUE INDEX leads_one_open_per_contact ON app.leads (account_id, contact_id)
  WHERE closed_at IS NULL AND deleted_at IS NULL;
