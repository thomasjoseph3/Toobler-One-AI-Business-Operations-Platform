-- F37, slice 7: what the daily check found about the platform's own AI keys (the ones in the server's .env).
--
-- A reference table shared by every business, so it has no account_id and is not fenced. The keys themselves are never stored: only
-- the company, the key's POSITION in the .env list (1, 2, 3...), and what the last check found. The check job (slice 9) writes it on the
-- owner connection; the app role can read it but never change it.

CREATE TABLE app.ai_platform_key_checks (
  provider       text        NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  key_position   integer     NOT NULL CHECK (key_position >= 1),
  status         text        NOT NULL CHECK (status IN ('working', 'limited', 'failed')),
  status_note    text        CHECK (length(status_note) <= 300),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, key_position)
);
REVOKE INSERT, UPDATE, DELETE ON app.ai_platform_key_checks FROM app_user;
