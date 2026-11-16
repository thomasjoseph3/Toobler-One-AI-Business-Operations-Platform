-- F15 slice 7a: conversations, their messages, and what each one led to (docs/CONVERSATION-TYPES.md, docs/ARCHITECTURE.md §2).
-- One `conversations` table serves every channel (web chat, WhatsApp, email, phone), so the inbox, the sorting and the reports do not
-- care which channel it was. A channel adds its own small detail table later if it needs one.
--
-- A conversation starts "open". When it ends it is sorted once: the type, how sure the AI was, whether a person must look, and what
-- it leads to (`conversation_outcomes`). Staff corrections and the lead / ticket links come with the next slices.

CREATE TABLE app.conversations (
  id             uuid PRIMARY KEY,
  account_id     uuid        NOT NULL REFERENCES app.accounts (id),
  channel        text        NOT NULL CHECK (channel IN ('webchat', 'whatsapp', 'email', 'phone')),
  -- Who is on the other end, as the channel saw them: a phone as digits only (the form contacts use) and/or an email in lower case.
  -- Both can be empty (an anonymous web visitor). The contact is made or found when the conversation is sorted.
  from_phone_key text        CHECK (from_phone_key ~ '^[0-9]{5,20}$'),
  from_email     text        CHECK (from_email = lower(from_email) AND length(from_email) <= 254),
  contact_id     uuid        REFERENCES app.contacts (id),
  -- The type (a key of the business's conversation types, kept as text because types can be removed), set when the conversation is sorted
  type_key       text        CHECK (length(type_key) <= 60),
  type_confidence numeric(3, 2) CHECK (type_confidence BETWEEN 0 AND 1),
  -- Who decided the type: a rule in code, the AI after the conversation ended, or a person (staff correction)
  type_source    text        CHECK (type_source IN ('rule', 'ai_final', 'staff')),
  -- The AI's one-line reason (kept free of personal details by its instructions), or the rule's name
  type_reason    text        CHECK (length(type_reason) <= 300),
  -- The type was applied with only fair confidence: staff confirm with one tap
  ai_unsure      boolean     NOT NULL DEFAULT false,
  needs_person   boolean     NOT NULL DEFAULT false,
  status         text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'sorted')),
  ended_at       timestamptz,
  sorted_at      timestamptz,
  created_by     jsonb,
  updated_by     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Sorted means it has a type, who decided it, and a time
  CONSTRAINT conversations_sorted_has_type CHECK (
    (status = 'sorted') = (sorted_at IS NOT NULL AND type_key IS NOT NULL AND type_source IS NOT NULL)
  ),
  -- Lets messages and outcomes point at a conversation of the same business only
  CONSTRAINT conversations_account_and_id UNIQUE (account_id, id)
);
CREATE INDEX conversations_by_status ON app.conversations (account_id, status, created_at DESC, id DESC);
CREATE INDEX conversations_by_contact ON app.conversations (account_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.conversations');

-- Defence in depth: business code can start a conversation and change only the columns that sorting and linking change. It can never
-- delete one, and never change the business, the channel, who was on the other end, or when it started.
REVOKE INSERT, UPDATE, DELETE ON app.conversations FROM app_user;
GRANT INSERT (id, account_id, channel, from_phone_key, from_email, contact_id, created_by, updated_by, created_at, updated_at)
  ON app.conversations TO app_user;
GRANT UPDATE (contact_id, type_key, type_confidence, type_source, type_reason, ai_unsure, needs_person, status, ended_at, sorted_at,
              updated_by, updated_at)
  ON app.conversations TO app_user;

-- What was said. Text only: written once, never edited or deleted (the history the inbox, the sorting and staff takeover read).
-- How long messages are kept is decided with the inbox (F21).
CREATE TABLE app.conversation_messages (
  id                 uuid PRIMARY KEY,
  account_id         uuid        NOT NULL REFERENCES app.accounts (id),
  conversation_id    uuid        NOT NULL,
  sender             text        NOT NULL CHECK (sender IN ('customer', 'agent', 'staff', 'system')),
  body               text        NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  -- The channel's own id for the message (a WhatsApp message id, an email Message-ID), so the same message arriving twice is stored once
  channel_message_id text        CHECK (length(channel_message_id) <= 300),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_same_business_fkey
    FOREIGN KEY (account_id, conversation_id) REFERENCES app.conversations (account_id, id)
);
CREATE INDEX conversation_messages_by_conversation
  ON app.conversation_messages (account_id, conversation_id, created_at, id);
CREATE UNIQUE INDEX conversation_messages_channel_message_unique
  ON app.conversation_messages (account_id, conversation_id, channel_message_id) WHERE channel_message_id IS NOT NULL;
SELECT app.enable_tenant_rls('app.conversation_messages');
REVOKE UPDATE, DELETE ON app.conversation_messages FROM app_user;

-- What each conversation led to, once per conversation and type, so sorting it again updates instead of duplicating.
CREATE TABLE app.conversation_outcomes (
  id              uuid PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  conversation_id uuid        NOT NULL,
  -- The type that caused it (text, as on the conversation)
  type_key        text        NOT NULL CHECK (length(type_key) <= 60),
  kind            text        NOT NULL CHECK (kind IN ('lead', 'ticket', 'log', 'filter', 'ignore', 'review')),
  confidence      numeric(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  ai_unsure       boolean     NOT NULL DEFAULT false,
  -- The lead or ticket this outcome made or joined (filled in when the outcome is applied, in a later slice)
  lead_id         uuid        REFERENCES app.leads (id),
  ticket_id       uuid,
  applied_at      timestamptz,
  -- Set when a staff correction made this outcome no longer apply (its lead or ticket is kept, off the board)
  superseded_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_outcomes_same_business_fkey
    FOREIGN KEY (account_id, conversation_id) REFERENCES app.conversations (account_id, id),
  CONSTRAINT conversation_outcomes_ticket_same_business_fkey
    FOREIGN KEY (account_id, ticket_id) REFERENCES app.tickets (account_id, id),
  CONSTRAINT conversation_outcomes_once_per_type UNIQUE (conversation_id, type_key)
);
CREATE INDEX conversation_outcomes_by_conversation ON app.conversation_outcomes (account_id, conversation_id);
CREATE TRIGGER conversation_outcomes_set_updated_at BEFORE UPDATE ON app.conversation_outcomes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.conversation_outcomes');
REVOKE INSERT, UPDATE, DELETE ON app.conversation_outcomes FROM app_user;
GRANT INSERT (id, account_id, conversation_id, type_key, kind, confidence, ai_unsure, lead_id, ticket_id, applied_at,
              superseded_at, created_at, updated_at)
  ON app.conversation_outcomes TO app_user;
GRANT UPDATE (kind, confidence, ai_unsure, lead_id, ticket_id, applied_at, superseded_at, updated_at)
  ON app.conversation_outcomes TO app_user;
