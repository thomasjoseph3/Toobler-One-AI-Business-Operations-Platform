-- F37, slice 9: which warning emails about the AI have already gone out (so one problem sends one email a day).
--
-- A platform-level record, not tied to one business: the key is what the warning is about, like `platform-key:gemini:2` or
-- `model-retiring:<model id>:7`. Only the owner connection (the nightly job) reads or writes it: the app role cannot touch it.
-- Warnings about a business's own keys use `ai_keys.last_notice_at` instead.

CREATE TABLE app.ai_notices_sent (
  notice_key text        PRIMARY KEY CHECK (length(notice_key) BETWEEN 1 AND 200),
  sent_at    timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app.ai_notices_sent FROM app_user;
