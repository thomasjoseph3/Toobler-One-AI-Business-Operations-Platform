-- F05 slice 1: companies (a firm, school, family or group that contacts belong to).
--
-- "Infosys HR" books trips for many staff. A contact belongs to at most one company (`contacts.company_id`). Two live companies of one business never
-- share a name once capital letters and spaces are ignored (`name_key`, generated so it can never drift from `name`), and never share a work domain.
-- Deleting a company is soft (`deleted_at`) and the app clears `company_id` on its contacts, so the contacts stay and the name can be used again.
-- A company's owner (a person of the business) and its contacts must belong to the same business (the composite keys check it).

CREATE TABLE app.companies (
  id            uuid PRIMARY KEY,
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  name          text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  -- The name in lower case with every space removed, for matching ("Infosys HR" = "infosys hr" = "InfosysHR")
  name_key      text        GENERATED ALWAYS AS (lower(regexp_replace(name, '\s', '', 'g'))) STORED,
  -- The work domain of its people's email addresses ("infosys.com"); never a free-mail domain (the app checks that)
  domain        text        CHECK (domain = lower(domain) AND length(domain) BETWEEN 3 AND 253),
  phone         text        CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  city          text        CHECK (length(city) <= 80),
  owner_user_id uuid,
  deleted_at    timestamptz,
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_owner_same_business_fkey
    FOREIGN KEY (account_id, owner_user_id) REFERENCES app.users (account_id, id),
  CONSTRAINT companies_account_and_id UNIQUE (account_id, id)
);
CREATE UNIQUE INDEX companies_name_key_unique ON app.companies (account_id, name_key) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX companies_domain_unique ON app.companies (account_id, domain) WHERE deleted_at IS NULL AND domain IS NOT NULL;
-- The list: newest changes first, per business
CREATE INDEX companies_list ON app.companies (account_id, updated_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON app.companies
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.companies');

-- Defence in depth: business code adds companies and changes the editable columns only. It never deletes a row (delete is soft) and never changes
-- the business or who made it.
REVOKE INSERT, UPDATE, DELETE ON app.companies FROM app_user;
GRANT INSERT (id, account_id, name, domain, phone, city, owner_user_id, created_by, updated_by, created_at, updated_at)
  ON app.companies TO app_user;
GRANT UPDATE (name, domain, phone, city, owner_user_id, deleted_at, updated_by, updated_at) ON app.companies TO app_user;

-- A contact's company (at most one). The pair of columns must point at a company of the same business.
ALTER TABLE app.contacts ADD COLUMN company_id uuid;
ALTER TABLE app.contacts ADD CONSTRAINT contacts_company_same_business_fkey
  FOREIGN KEY (account_id, company_id) REFERENCES app.companies (account_id, id);
CREATE INDEX contacts_by_company ON app.contacts (account_id, company_id) WHERE company_id IS NOT NULL AND deleted_at IS NULL;
GRANT INSERT (company_id) ON app.contacts TO app_user;
GRANT UPDATE (company_id) ON app.contacts TO app_user;
