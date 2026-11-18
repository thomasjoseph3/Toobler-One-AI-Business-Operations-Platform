-- F09 slice 5: what the AI heard for the business's own custom fields ("AI should ask"), kept with the conversation until its contact and lead
-- are made. Keyed "contact.car_model" / "lead.guest_count": the object, a dot, the field's key. Values are the customer's words, already checked.

ALTER TABLE app.conversation_facts
  ADD COLUMN custom_answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(custom_answers) = 'object');
GRANT INSERT (custom_answers) ON app.conversation_facts TO app_user;
GRANT UPDATE (custom_answers) ON app.conversation_facts TO app_user;
