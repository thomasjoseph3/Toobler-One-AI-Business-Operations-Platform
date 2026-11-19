-- F15 slice 7c: staff corrections of a conversation's type (docs/CONVERSATION-TYPES.md step 5), and a note of which outcomes MADE their lead
-- or ticket (as opposed to joining one that was already there), so a correction only closes what the conversation itself made.

-- One row each time a person changes a conversation's type: from what, to what, by whom, when. Counted later for "how often the AI was
-- right" (the accuracy report, F28) and the source of the business's own examples. Written once, never edited or deleted.
CREATE TABLE app.classification_corrections (
  id              uuid PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  conversation_id uuid        NOT NULL,
  from_type_key   text        NOT NULL CHECK (length(from_type_key) <= 60),
  to_type_key     text        NOT NULL CHECK (length(to_type_key) <= 60 AND to_type_key <> from_type_key),
  by_user_id      uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classification_corrections_conversation_fkey
    FOREIGN KEY (account_id, conversation_id) REFERENCES app.conversations (account_id, id),
  CONSTRAINT classification_corrections_user_same_business_fkey
    FOREIGN KEY (account_id, by_user_id) REFERENCES app.users (account_id, id)
);
CREATE INDEX classification_corrections_by_conversation
  ON app.classification_corrections (account_id, conversation_id, created_at);
SELECT app.enable_tenant_rls('app.classification_corrections');
REVOKE UPDATE, DELETE ON app.classification_corrections FROM app_user;

-- Whether the conversation MADE the lead or ticket of an outcome (true), or only joined one that was already there, or reopened one (false).
ALTER TABLE app.conversation_outcomes ADD COLUMN created_record boolean NOT NULL DEFAULT false;
GRANT INSERT (created_record) ON app.conversation_outcomes TO app_user;
GRANT UPDATE (created_record) ON app.conversation_outcomes TO app_user;
