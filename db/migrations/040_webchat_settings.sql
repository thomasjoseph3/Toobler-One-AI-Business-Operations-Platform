-- F20 slice 1: the settings of a business's website chat bubble (docs/features/F20-website-chat.md).
--
-- One row per business, made the first time its settings are read. `widget_key` is the one thing a visitor's browser knows: the public chat
-- routes find the business from it, so it is long, random and never changes (it is not a secret: it sits in the page source, which is why
-- every public call is also checked against the business's own websites). A new business starts with NO allowed website, so its chat works
-- nowhere until it lists its site.

CREATE TABLE app.webchat_settings (
  account_id        uuid PRIMARY KEY REFERENCES app.accounts (id),
  widget_key        text        NOT NULL UNIQUE CHECK (widget_key ~ '^wk_[A-Za-z0-9_-]{32}$'),
  -- The bubble's colour as #RRGGBB (the first one is the owner-chosen default: near black, like the staff app's main button)
  colour            text        NOT NULL DEFAULT '#161715' CHECK (colour ~ '^#[0-9A-Fa-f]{6}$'),
  greeting          text        NOT NULL DEFAULT 'Hi! How can I help you today?' CHECK (length(greeting) BETWEEN 1 AND 200),
  position          text        NOT NULL DEFAULT 'bottom_right' CHECK (position IN ('bottom_right', 'bottom_left')),
  -- The websites the bubble may appear on, each as an origin like https://nairstays.example (a list of text)
  allowed_websites  jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_websites) = 'array' AND jsonb_array_length(allowed_websites) <= 20),
  -- The Call and WhatsApp buttons are plain links built from these; empty means that button is hidden. International form, like +919847012345.
  phone_number      text        CHECK (phone_number ~ '^\+[0-9]{6,15}$'),
  whatsapp_number   text        CHECK (whatsapp_number ~ '^\+[0-9]{6,15}$'),
  whatsapp_message  text        CHECK (length(whatsapp_message) <= 300),
  -- Which buttons the launcher shows, in what order (some of chat, call, whatsapp)
  button_order      jsonb       NOT NULL DEFAULT '["chat","call","whatsapp"]'::jsonb CHECK (jsonb_typeof(button_order) = 'array' AND jsonb_array_length(button_order) BETWEEN 1 AND 3),
  -- "Last seen on <website> today": set when the bubble's settings are fetched from an allowed website
  last_seen_website text        CHECK (length(last_seen_website) <= 300),
  last_seen_at      timestamptz,
  created_by        jsonb,
  updated_by        jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER webchat_settings_set_updated_at BEFORE UPDATE ON app.webchat_settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.webchat_settings');

-- Business code can make its settings row and change the named columns. It can never delete it, change its key or move it to another business.
REVOKE INSERT, UPDATE, DELETE ON app.webchat_settings FROM app_user;
GRANT INSERT (account_id, widget_key, created_by, updated_by, created_at, updated_at) ON app.webchat_settings TO app_user;
GRANT UPDATE (colour, greeting, position, allowed_websites, phone_number, whatsapp_number, whatsapp_message, button_order,
              last_seen_website, last_seen_at, updated_by, updated_at)
  ON app.webchat_settings TO app_user;
