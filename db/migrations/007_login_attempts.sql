-- F01, slice 6: lockout after repeated wrong passwords.
--
-- One row per EMAIL TYPED (known or not), so a lockout can never reveal whether an account exists. `failed_count` counts
-- wrong passwords inside a 15-minute window that starts at the first of them; the 5th sets `locked_until` 15 minutes
-- ahead. A good sign-in deletes the row. Like sessions it is needed before anyone is signed in, so it is not fenced to a
-- business; instead the app role (app_user) is locked out of it completely.

CREATE TABLE app.login_attempts (
  email             text        PRIMARY KEY,
  failed_count      integer     NOT NULL CHECK (failed_count > 0),
  window_started_at timestamptz NOT NULL,
  locked_until      timestamptz
);

-- Migration 001 gives app_user access to every new table by default. This one must stay closed to it.
REVOKE ALL ON app.login_attempts FROM app_user;
