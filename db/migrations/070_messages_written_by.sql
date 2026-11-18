-- F21: a staff reply records WHICH person wrote it, so the conversation can say "Rahul replied" and the record shows who spoke to the customer.
-- Empty for the customer, the AI and system notes. The writer must be a person of the same business (the composite key checks it).

ALTER TABLE app.conversation_messages ADD COLUMN by_user_id uuid;
ALTER TABLE app.conversation_messages ADD CONSTRAINT conversation_messages_writer_same_business_fkey
  FOREIGN KEY (account_id, by_user_id) REFERENCES app.users (account_id, id);
ALTER TABLE app.conversation_messages ADD CONSTRAINT conversation_messages_writer_is_staff
  CHECK (by_user_id IS NULL OR sender = 'staff');
GRANT INSERT (by_user_id) ON app.conversation_messages TO app_user;
