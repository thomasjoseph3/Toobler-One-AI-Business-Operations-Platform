-- F09 slice 3: the answers to a business's custom fields on contacts.
--
-- One jsonb object per contact, keyed by the field's key ({"birthday": "1990-05-04", "car_model": "Swift"}). An empty answer removes its key. Answers
-- for a field that was removed stay here, hidden, until the nightly purge (a later slice) deletes them 30 days after the field was removed.

ALTER TABLE app.contacts
  ADD COLUMN custom jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom) = 'object');

-- Business code may set the answers when adding and changing a contact, like the other editable columns
GRANT INSERT (custom) ON app.contacts TO app_user;
GRANT UPDATE (custom) ON app.contacts TO app_user;
