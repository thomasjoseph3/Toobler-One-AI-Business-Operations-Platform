-- F26: a business's email connection (the mailbox the AI reads and answers) and the replies the AI drafted for the team to approve.
--
-- One connection per business. The mailbox password is a secret: stored ENCRYPTED (same method as the AI keys, tied to the business), shown only
-- as its last four characters, never logged. Gmail and Outlook work through an app password over IMAP (sign-in with OAuth comes later).

CREATE TABLE app.email_connections (
  account_id          uuid PRIMARY KEY REFERENCES app.accounts (id),
  -- The mailbox address: where enquiries arrive and what replies are sent from
  address             text        NOT NULL CHECK (address = lower(address) AND address ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(address) <= 200),
  username            text        NOT NULL CHECK (length(username) BETWEEN 1 AND 200),
  encrypted_password  text        NOT NULL CHECK (length(encrypted_password) BETWEEN 1 AND 4000),
  password_last_four  text        NOT NULL CHECK (length(password_last_four) = 4),
  imap_host           text        NOT NULL CHECK (length(imap_host) BETWEEN 3 AND 200),
  imap_port           integer     NOT NULL DEFAULT 993 CHECK (imap_port BETWEEN 1 AND 65535),
  smtp_host           text        NOT NULL CHECK (length(smtp_host) BETWEEN 3 AND 200),
  smtp_port           integer     NOT NULL DEFAULT 587 CHECK (smtp_port BETWEEN 1 AND 65535),
  -- send: the AI sends its reply. draft: the AI writes a reply and a team member approves it first.
  reply_mode          text        NOT NULL DEFAULT 'draft' CHECK (reply_mode IN ('send', 'draft')),
  -- When false the mailbox is not read (the settings are kept)
  read_emails         boolean     NOT NULL DEFAULT true,
  -- Emails received after this moment have not been looked at yet. Starts a day before the mailbox was connected.
  checked_up_to       timestamptz NOT NULL DEFAULT now() - interval '1 day',
  status              text        NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked', 'working', 'failed')),
  status_note         text        CHECK (length(status_note) <= 300),
  status_checked_at   timestamptz,
  last_email_at       timestamptz,
  created_by          jsonb,
  updated_by          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER email_connections_set_updated_at BEFORE UPDATE ON app.email_connections
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.email_connections');

REVOKE INSERT, UPDATE, DELETE ON app.email_connections FROM app_user;
GRANT INSERT (account_id, address, username, encrypted_password, password_last_four, imap_host, imap_port, smtp_host, smtp_port,
              reply_mode, read_emails, created_by, updated_by, created_at, updated_at)
  ON app.email_connections TO app_user;
GRANT UPDATE (address, username, encrypted_password, password_last_four, imap_host, imap_port, smtp_host, smtp_port, reply_mode,
              read_emails, checked_up_to, status, status_note, status_checked_at, last_email_at, updated_by, updated_at)
  ON app.email_connections TO app_user;
GRANT DELETE ON app.email_connections TO app_user;

-- A reply the AI wrote that waits for a team member to approve it (reply mode "draft"). Approving sends it; discarding keeps the row as history.
CREATE TABLE app.email_drafts (
  id               uuid PRIMARY KEY,
  account_id       uuid        NOT NULL REFERENCES app.accounts (id),
  conversation_id  uuid        NOT NULL,
  to_email         text        NOT NULL CHECK (length(to_email) <= 200),
  subject          text        NOT NULL CHECK (length(subject) <= 300),
  body             text        NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  -- The customer's email this answers, and the thread before it (message ids), so the reply stays in their thread
  in_reply_to      text        CHECK (length(in_reply_to) <= 300),
  thread_references jsonb      NOT NULL DEFAULT '[]'::jsonb,
  status           text        NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'sent', 'discarded')),
  decided_at       timestamptz,
  decided_by       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_drafts_account_and_id UNIQUE (account_id, id),
  FOREIGN KEY (account_id, conversation_id) REFERENCES app.conversations (account_id, id)
);
CREATE INDEX email_drafts_waiting ON app.email_drafts (account_id, created_at) WHERE status = 'waiting';
SELECT app.enable_tenant_rls('app.email_drafts');
REVOKE INSERT, UPDATE, DELETE ON app.email_drafts FROM app_user;
GRANT INSERT (id, account_id, conversation_id, to_email, subject, body, in_reply_to, thread_references, created_at)
  ON app.email_drafts TO app_user;
GRANT UPDATE (body, status, decided_at, decided_by) ON app.email_drafts TO app_user;
