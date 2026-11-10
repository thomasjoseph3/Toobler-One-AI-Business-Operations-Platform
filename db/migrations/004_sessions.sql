-- F01, slice 2: signing in. One row per sign-in on one device.
--
-- Like the password hashes, sessions are needed before a business is known (the access token only names the session), so
-- the table is NOT fenced; instead the app role (app_user) is locked out of it completely. Only the owner connection,
-- through named functions in modules/core/auth, can read or write it.
--
-- The refresh token is never stored, only its hash. `previous_refresh_token_hash` and `rotated_at` are used by the
-- refresh route (a later slice): the token is replaced at every refresh, and the old one is kept for a minute so two
-- requests refreshing at once do not look like theft.

CREATE TABLE app.sessions (
  id                          uuid PRIMARY KEY,
  user_id                     uuid        NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  refresh_token_hash          text        NOT NULL UNIQUE,
  previous_refresh_token_hash text,
  rotated_at                  timestamptz,
  user_agent                  text,
  ip                          text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  last_used_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL,
  revoked_at                  timestamptz,
  revoked_reason              text
);
CREATE INDEX sessions_by_user ON app.sessions (user_id);
CREATE INDEX sessions_by_previous_hash ON app.sessions (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;

-- Migration 001 gives app_user access to every new table by default. This one must stay closed to it.
REVOKE ALL ON app.sessions FROM app_user;

-- When the person last signed in
ALTER TABLE app.users ADD COLUMN last_login_at timestamptz;
