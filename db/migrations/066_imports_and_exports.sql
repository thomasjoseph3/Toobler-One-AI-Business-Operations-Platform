-- F12: spreadsheet imports and exports.
--
-- An import is: upload a file (the rows are kept here while the manager checks the columns), map the columns, run (a background job), read the report.
-- The rows hold personal data, so they are deleted as soon as the run ends (`data` becomes null); only the counts and the report of what was skipped stay.
-- An export is a CSV built by a background job from a list's own filters, kept here for 24 hours and given out through a one-time-minted link.

CREATE TABLE app.imports (
  id              uuid PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  object          text        NOT NULL CHECK (object IN ('contact')),
  file_name       text        NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  status          text        NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'ready', 'running', 'done', 'failed')),
  -- The first row of the file: the column names, and the rows below it as lists of texts (null once the run ends)
  headers         jsonb       NOT NULL CHECK (jsonb_typeof(headers) = 'array'),
  data            jsonb       CHECK (data IS NULL OR jsonb_typeof(data) = 'array'),
  row_count       integer     NOT NULL CHECK (row_count >= 0),
  -- What each column means: a list as long as `headers`, each `name`, `phone`, `email`, `company`, `language`, `custom.<key>` or null (not imported)
  mapping         jsonb       CHECK (mapping IS NULL OR jsonb_typeof(mapping) = 'array'),
  -- The business's own phone country, so a number typed without a country code is read the same way as when adding a contact by hand
  default_country text        NOT NULL CHECK (default_country ~ '^[A-Z]{2}$'),
  -- {newContacts, matchedContacts, skipped} worked out for the mapping, then the real counts when done
  counts          jsonb       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(counts) = 'object'),
  -- What was skipped and why: a list of {row, reason, message}, at most 200
  report          jsonb       NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(report) = 'array'),
  -- How many rows the run has dealt with so far (a retried job carries on from here)
  processed       integer     NOT NULL DEFAULT 0 CHECK (processed >= 0),
  error           text        CHECK (length(error) <= 500),
  by_user_id      uuid        NOT NULL,
  created_by      jsonb,
  updated_by      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  CONSTRAINT imports_account_and_id UNIQUE (account_id, id),
  CONSTRAINT imports_by_user_fkey FOREIGN KEY (account_id, by_user_id) REFERENCES app.users (account_id, id)
);
CREATE INDEX imports_recent ON app.imports (account_id, created_at DESC);
CREATE TRIGGER imports_set_updated_at BEFORE UPDATE ON app.imports FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.imports');
REVOKE UPDATE, DELETE ON app.imports FROM app_user;
GRANT UPDATE (status, data, mapping, counts, report, processed, error, started_at, finished_at, updated_by, updated_at) ON app.imports TO app_user;

CREATE TABLE app.exports (
  id            uuid PRIMARY KEY,
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  object        text        NOT NULL CHECK (object IN ('contact', 'company', 'lead')),
  -- The list's own address query (search, filters, status...), so the file holds exactly what the list showed
  query         text        NOT NULL DEFAULT '' CHECK (length(query) <= 5000),
  status        text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  file_name     text        CHECK (length(file_name) <= 255),
  content       bytea,
  row_count     integer     CHECK (row_count >= 0),
  -- The download link carries a random token; only its SHA-256 is kept, and the link works until `expires_at`
  token_hash    text        CHECK (length(token_hash) = 64),
  expires_at    timestamptz,
  error         text        CHECK (length(error) <= 500),
  by_user_id    uuid        NOT NULL,
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exports_account_and_id UNIQUE (account_id, id),
  CONSTRAINT exports_by_user_fkey FOREIGN KEY (account_id, by_user_id) REFERENCES app.users (account_id, id)
);
CREATE INDEX exports_recent ON app.exports (account_id, created_at DESC);
CREATE TRIGGER exports_set_updated_at BEFORE UPDATE ON app.exports FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.exports');
REVOKE UPDATE, DELETE ON app.exports FROM app_user;
GRANT UPDATE (status, file_name, content, row_count, token_hash, expires_at, error, updated_by, updated_at) ON app.exports TO app_user;
