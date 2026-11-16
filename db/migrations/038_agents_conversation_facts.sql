-- F19 slice 3: what the AI agent learned in a conversation (the details, the one promise), and test chats.
--
-- A test chat ("Test the agent") is an ordinary conversation marked `is_test`. It is saved so the owner can come back to it and so the whole
-- path is the real one, but it is never sorted into a lead or a ticket and is left out of the inbox and the reports.
--
-- `conversation_facts` holds what the agent remembers between messages. The promise is stored as plain facts (its kind, the words said,
-- when it falls due): the tasks feature (F08) turns it into a task later, and scoring (F10) reads the details. Nothing is deleted.

ALTER TABLE app.conversations ADD COLUMN is_test boolean NOT NULL DEFAULT false;
GRANT INSERT (is_test) ON app.conversations TO app_user;

CREATE TABLE app.conversation_facts (
  conversation_id      uuid PRIMARY KEY,
  account_id           uuid        NOT NULL REFERENCES app.accounts (id),
  -- What the customer told us, by label ("Name", "Phone", "Dates"): only what they said
  details              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- What the conversation is, for choosing the promise
  situation            text        NOT NULL DEFAULT 'sale_enquiry' CHECK (situation IN ('sale_enquiry', 'ready_to_book', 'not_a_sale')),
  -- The one promise: its kind, the words that were said, and when it falls due (a callback time) or nothing
  promise_kind         text        CHECK (promise_kind IN ('call_back_open', 'call_back_closed', 'send_confirmation', 'passed_to_manager')),
  promise_sentence     text        CHECK (length(promise_sentence) <= 300),
  promise_due_at       timestamptz,
  promise_made_at      timestamptz,
  -- Why the agent asked for a person (short, in its own words)
  callback_reason      text        CHECK (length(callback_reason) <= 300),
  -- What the tools gave back lately, so the amount check can accept a price repeated in a later message
  earlier_tool_results jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by           jsonb,
  updated_by           jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- A promise is all of its parts or none
  CONSTRAINT conversation_facts_promise_complete CHECK (
    (promise_kind IS NULL) = (promise_sentence IS NULL) AND (promise_kind IS NULL) = (promise_made_at IS NULL)
  ),
  CONSTRAINT conversation_facts_same_business_fkey
    FOREIGN KEY (account_id, conversation_id) REFERENCES app.conversations (account_id, id)
);
CREATE TRIGGER conversation_facts_set_updated_at BEFORE UPDATE ON app.conversation_facts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.conversation_facts');

-- Business code can write and change the facts of a conversation, never delete them, and never move them to another conversation or business
REVOKE INSERT, UPDATE, DELETE ON app.conversation_facts FROM app_user;
GRANT INSERT (conversation_id, account_id, details, situation, promise_kind, promise_sentence, promise_due_at, promise_made_at,
              callback_reason, earlier_tool_results, created_by, updated_by, created_at, updated_at)
  ON app.conversation_facts TO app_user;
GRANT UPDATE (details, situation, promise_kind, promise_sentence, promise_due_at, promise_made_at, callback_reason,
              earlier_tool_results, updated_by, updated_at)
  ON app.conversation_facts TO app_user;
