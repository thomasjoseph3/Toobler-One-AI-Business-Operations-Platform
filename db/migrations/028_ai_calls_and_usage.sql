-- F37, slice 6: a record of every AI call, and daily totals.
--
-- `ai_calls` has one row per call, with NO message text and no key: which job, which agent and channel asked, which model and key
-- position answered, how many tries it took, whether a fallback was used and why, tokens, and how long it took. It is kept 90 days
-- (a nightly job deletes older rows, slice 9). `ai_usage` is the daily total of the same facts, kept for good: it is small, and it
-- is what the monthly cap on the platform's keys is counted from.

CREATE TABLE app.ai_calls (
  id              uuid PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  task            text        NOT NULL,
  agent_id        text        NOT NULL,
  channel         text        NOT NULL,
  prompt_version  text        NOT NULL,
  conversation_id uuid,
  -- Who answered. When every try failed this is the last model tried.
  provider        text        NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  model_name      text        NOT NULL,
  key_source      text        NOT NULL CHECK (key_source IN ('platform', 'own')),
  key_position    integer     NOT NULL,
  success         boolean     NOT NULL,
  -- When it failed: why the last try failed (rate_limited, bad_key, model_missing, timed_out, error)
  error_kind      text,
  attempt_count   integer     NOT NULL CHECK (attempt_count >= 1),
  fallback_used   boolean     NOT NULL DEFAULT false,
  fallback_reason text,
  -- Every try in order: [{provider, modelName, keySource, keyPosition, outcome}] (positions, never keys)
  attempts        jsonb       NOT NULL DEFAULT '[]',
  input_tokens    integer     NOT NULL DEFAULT 0,
  output_tokens   integer     NOT NULL DEFAULT 0,
  cached_tokens   integer     NOT NULL DEFAULT 0,
  usage_missing   boolean     NOT NULL DEFAULT false,
  latency_ms      integer
);
CREATE INDEX ai_calls_newest_first ON app.ai_calls (account_id, created_at DESC, id);
CREATE INDEX ai_calls_by_task ON app.ai_calls (account_id, task, created_at DESC) WHERE success;
SELECT app.enable_tenant_rls('app.ai_calls');
-- Business code can add a call record. It can never change or delete one.
REVOKE INSERT, UPDATE, DELETE ON app.ai_calls FROM app_user;
GRANT INSERT ON app.ai_calls TO app_user;

CREATE TABLE app.ai_usage (
  account_id    uuid    NOT NULL REFERENCES app.accounts (id),
  day           date    NOT NULL,
  provider      text    NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  model_name    text    NOT NULL,
  task          text    NOT NULL,
  agent_id      text    NOT NULL,
  channel       text    NOT NULL,
  key_source    text    NOT NULL CHECK (key_source IN ('platform', 'own')),
  -- Calls that were answered (the number the monthly cap counts), calls where every try failed, calls that needed a fallback
  calls         integer NOT NULL DEFAULT 0,
  failures      integer NOT NULL DEFAULT 0,
  fallbacks     integer NOT NULL DEFAULT 0,
  input_tokens  bigint  NOT NULL DEFAULT 0,
  output_tokens bigint  NOT NULL DEFAULT 0,
  cached_tokens bigint  NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, provider, model_name, task, agent_id, channel, key_source)
);
SELECT app.enable_tenant_rls('app.ai_usage');
REVOKE INSERT, UPDATE, DELETE ON app.ai_usage FROM app_user;
GRANT INSERT ON app.ai_usage TO app_user;
GRANT UPDATE (calls, failures, fallbacks, input_tokens, output_tokens, cached_tokens) ON app.ai_usage TO app_user;
