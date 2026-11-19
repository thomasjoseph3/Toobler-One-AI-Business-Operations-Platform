-- F25: a business's WhatsApp connection, and the record that stops one WhatsApp message being answered twice.
--
-- One row per business. The access token is a secret: it is stored ENCRYPTED (same method as the AI keys, tied to the business), shown only as its
-- last four characters, and never logged. `phone_number_id` is Meta's id of the number customers write to: it is how an incoming message finds its
-- business, so it is unique across all businesses (a number belongs to one business).

CREATE TABLE app.whatsapp_connections (
  account_id            uuid PRIMARY KEY REFERENCES app.accounts (id),
  phone_number_id       text        NOT NULL UNIQUE CHECK (phone_number_id ~ '^[0-9]{5,30}$'),
  -- The WhatsApp Business Account the number is on (needed later for templates), or null
  business_account_id   text        CHECK (business_account_id ~ '^[0-9]{5,30}$'),
  -- The number as customers see it, for showing on the screen and the "chat with us" link: international form like +919847012345
  display_phone_number  text        CHECK (display_phone_number ~ '^\+[0-9]{6,15}$'),
  -- 'v1.<iv>.<tag>.<ciphertext>': never the token itself
  encrypted_access_token text       NOT NULL CHECK (length(encrypted_access_token) BETWEEN 1 AND 4000),
  token_last_four       text        NOT NULL CHECK (length(token_last_four) = 4),
  -- When false the business keeps its settings but the AI no longer answers on WhatsApp
  answer_messages       boolean     NOT NULL DEFAULT true,
  -- unchecked: never tested. working / failed: the result of the last "Check connection" or of real sending.
  status                text        NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'working', 'failed')),
  status_note           text        CHECK (length(status_note) <= 300),
  status_checked_at     timestamptz,
  -- The last time a customer's message arrived on this number
  last_message_at       timestamptz,
  created_by            jsonb,
  updated_by            jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER whatsapp_connections_set_updated_at BEFORE UPDATE ON app.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.whatsapp_connections');

-- Business code can make its connection row, change its settings and replace the token. It can never delete it or move it to another business.
REVOKE INSERT, UPDATE, DELETE ON app.whatsapp_connections FROM app_user;
GRANT INSERT (account_id, phone_number_id, business_account_id, display_phone_number, encrypted_access_token, token_last_four,
              answer_messages, created_by, updated_by, created_at, updated_at)
  ON app.whatsapp_connections TO app_user;
GRANT UPDATE (phone_number_id, business_account_id, display_phone_number, encrypted_access_token, token_last_four, answer_messages,
              status, status_note, status_checked_at, last_message_at, updated_by, updated_at)
  ON app.whatsapp_connections TO app_user;
-- Removing the connection is a real delete of the row (and with it the encrypted token)
GRANT DELETE ON app.whatsapp_connections TO app_user;

-- Meta delivers a message again when it does not get a quick answer. The first delivery of each message id writes a row here; a second
-- delivery finds the row and is ignored, so a customer is never answered twice. Rows older than a week are of no use.
CREATE TABLE app.channel_message_receipts (
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  channel       text        NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  external_id   text        NOT NULL CHECK (length(external_id) BETWEEN 1 AND 300),
  received_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, channel, external_id)
);
SELECT app.enable_tenant_rls('app.channel_message_receipts');
REVOKE INSERT, UPDATE, DELETE ON app.channel_message_receipts FROM app_user;
GRANT INSERT (account_id, channel, external_id, received_at) ON app.channel_message_receipts TO app_user;
GRANT DELETE ON app.channel_message_receipts TO app_user;
