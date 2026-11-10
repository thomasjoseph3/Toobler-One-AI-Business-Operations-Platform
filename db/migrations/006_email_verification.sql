-- F01, slice 4: verifying an email address.
--
-- 1. users.email_verified_at: when the person proved they own the email (empty = not yet). The app role (app_user) is NOT
--    given the right to write this column (migration 005 lists exactly the columns it may write, and this one is left
--    out on purpose). Verification runs on the owner connection, through one named function, so a bug in business code
--    can never mark someone verified.
-- 2. auth_tokens: the single-use links we email ("verify your email" now; "reset your password" in a later slice, which
--    is why there is a `purpose`). Only the hash of a link is stored, so a copy of the table cannot be used to verify
--    anyone. Like sessions and password hashes it is not fenced to a business; instead the app role is locked out.

ALTER TABLE app.users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE app.auth_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  purpose     text        NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX auth_tokens_by_user ON app.auth_tokens (user_id, purpose);

-- Migration 001 gives app_user access to every new table by default. This one must stay closed to it.
REVOKE ALL ON app.auth_tokens FROM app_user;
