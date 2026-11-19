-- F10 slice 1: what a lead's temperature (hot, warm, cold) is made from, and why it has the value it has.
-- The score is worked out by code from facts the AI recorded: did the person ask the price, did they ask to book, and the dates they gave.
-- `temperature_set_by` says who decided: the rules, or a person by hand (which wins until the next conversation scores the lead again).

ALTER TABLE app.leads
  ADD COLUMN temperature_reason text CHECK (length(temperature_reason) <= 200),
  ADD COLUMN temperature_set_by text CHECK (temperature_set_by IN ('rules', 'manual')),
  ADD COLUMN asked_price boolean NOT NULL DEFAULT false,
  ADD COLUMN asked_to_book boolean NOT NULL DEFAULT false;

GRANT INSERT (temperature_reason, temperature_set_by, asked_price, asked_to_book) ON app.leads TO app_user;
GRANT UPDATE (temperature_reason, temperature_set_by, asked_price, asked_to_book) ON app.leads TO app_user;
