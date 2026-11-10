-- F01, slice 1: the kinds of business a person can pick at sign-up.
--
-- A reference table shared by every business, so it has no account_id and is not fenced. The app role (app_user) may
-- READ it (later, presets for each industry are looked up from it) but never change it: only the platform team will add
-- or switch off industries, through a platform-only route that arrives after sign-in exists.

CREATE TABLE app.industries (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  label      text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  sort_order integer     NOT NULL DEFAULT 100,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER industries_set_updated_at BEFORE UPDATE ON app.industries
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Migration 001 gives app_user full access to every new table by default; this one is read-only for it.
REVOKE INSERT, UPDATE, DELETE ON app.industries FROM app_user;

INSERT INTO app.industries (id, label, sort_order) VALUES
  ('general',      'General business',              10),
  ('hotel_resort', 'Hotel or resort',               20),
  ('real_estate',  'Real estate',                   30),
  ('clinic',       'Clinic or hospital',            40),
  ('education',    'School, college or coaching',   50),
  ('services',     'Professional or home services', 60),
  ('retail',       'Shop or retail',                70),
  ('other',        'Something else',               999);

-- A business can only have an industry that exists. (accounts.industry already defaults to 'general'.)
ALTER TABLE app.accounts
  ADD CONSTRAINT accounts_industry_fkey FOREIGN KEY (industry) REFERENCES app.industries (id);
