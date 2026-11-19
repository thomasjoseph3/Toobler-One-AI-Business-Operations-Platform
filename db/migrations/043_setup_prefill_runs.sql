-- F31 slice 3: one row for every time the setup wizard reads a business's website (or Google listing) to fill in answers.
-- The row says how the reading went. It holds no page text: the answers it found go to business_answers (as "Please check"),
-- and what looks like something the business sells is kept here as suggestions for the owner to accept.

CREATE TABLE app.prefill_runs (
  id                   uuid        PRIMARY KEY,
  account_id           uuid        NOT NULL REFERENCES app.accounts (id),
  website_url          text        CHECK (length(website_url) <= 500),
  -- What the owner typed to find the Google listing: the business's name or a Google Maps link
  google_listing_text  text        CHECK (length(google_listing_text) <= 500),
  status               text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'reading', 'done', 'failed')),
  -- When it failed: a code the screen can use, and a message in plain words (never page text)
  error_code           text        CHECK (length(error_code) <= 60),
  error_message        text        CHECK (length(error_message) <= 300),
  pages_read           integer     NOT NULL DEFAULT 0,
  -- The questions that now have an answer waiting for a check, and how many were left alone because the owner had confirmed them
  answers_found        text[]      NOT NULL DEFAULT '{}',
  answers_skipped      integer     NOT NULL DEFAULT 0,
  -- Things the site seems to sell, for the owner to accept or ignore: [{ name, description, fromPricePaise }]
  suggested_offerings  jsonb       NOT NULL DEFAULT '[]',
  created_by           jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  CONSTRAINT prefill_runs_has_a_source CHECK (website_url IS NOT NULL OR google_listing_text IS NOT NULL)
);
CREATE INDEX prefill_runs_account_created_idx ON app.prefill_runs (account_id, created_at DESC);
SELECT app.enable_tenant_rls('app.prefill_runs');

-- Business code can add a run and change how it is going. It can never delete one, and never change the business, the source or who started it.
REVOKE INSERT, UPDATE, DELETE ON app.prefill_runs FROM app_user;
GRANT INSERT (id, account_id, website_url, google_listing_text, status, created_by, created_at)
  ON app.prefill_runs TO app_user;
GRANT UPDATE (status, error_code, error_message, pages_read, answers_found, answers_skipped, suggested_offerings, finished_at)
  ON app.prefill_runs TO app_user;
