-- F09 slice 4: the answers to a business's custom fields on companies and leads (contacts got theirs in 057).
-- One jsonb object per record, keyed by the field's key. An empty answer removes its key; answers of a removed field stay, hidden, until the purge.

ALTER TABLE app.companies
  ADD COLUMN custom jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object');
ALTER TABLE app.leads
  ADD COLUMN custom jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object');

GRANT INSERT (custom) ON app.companies TO app_user;
GRANT UPDATE (custom) ON app.companies TO app_user;
GRANT INSERT (custom) ON app.leads TO app_user;
GRANT UPDATE (custom) ON app.leads TO app_user;
