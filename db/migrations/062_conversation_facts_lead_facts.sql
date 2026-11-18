-- F10 slice 2: what the AI heard that scores a lead: did the customer ask the price, and the dates they gave (as real dates).
-- "Asked to book" is already kept (the conversation's `situation` is `ready_to_book`). They wait here until the conversation's lead is made.

ALTER TABLE app.conversation_facts
  ADD COLUMN asked_price boolean NOT NULL DEFAULT false,
  ADD COLUMN date_from date,
  ADD COLUMN date_to date,
  ADD CONSTRAINT conversation_facts_dates_in_order CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from);
GRANT INSERT (asked_price, date_from, date_to) ON app.conversation_facts TO app_user;
GRANT UPDATE (asked_price, date_from, date_to) ON app.conversation_facts TO app_user;
