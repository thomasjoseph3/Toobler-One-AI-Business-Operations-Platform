-- F16 slice 4: the country a phone number belongs to when it is typed without a country code (decision R35). It sits on the
-- business itself, next to its time zone (accounts.time_zone, there since F01), so each setting has one home and a signed-in
-- person's details can carry both. India until the business changes it.

ALTER TABLE app.accounts
  ADD COLUMN default_country text NOT NULL DEFAULT 'IN' CHECK (default_country ~ '^[A-Z]{2}$');
