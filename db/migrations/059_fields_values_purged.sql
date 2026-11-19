-- F09 slice 5: the nightly purge of removed custom fields.
-- A removed field keeps its saved answers, hidden, for 30 days. After that a nightly job tells the contacts, companies and leads modules to delete
-- those answers for good, then marks the field here. The definition row itself stays (the key is never reused), so this column is the memory of
-- "the answers are gone".

ALTER TABLE app.field_definitions ADD COLUMN values_purged_at timestamptz;
-- Only a removed field can have its answers purged
ALTER TABLE app.field_definitions
  ADD CONSTRAINT field_definitions_purged_only_when_removed CHECK (values_purged_at IS NULL OR archived_at IS NOT NULL);
GRANT UPDATE (values_purged_at) ON app.field_definitions TO app_user;
