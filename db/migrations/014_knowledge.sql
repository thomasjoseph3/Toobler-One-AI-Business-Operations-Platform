-- F16 slice 0: the business profile (answers to the fixed business questions) and the situations (how the business wants
-- common moments handled). The question list itself is code, not a table: new questions are added by us, not by businesses.
--
-- An answer is `confirmed` once a manager has typed or accepted it. An answer the system filled in (from a website, later)
-- stays `check` and is never given to the AI until a manager confirms it.

CREATE TABLE app.business_answers (
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  -- The question's key from the question list in code, for example "business_name"
  question_key  text        NOT NULL CHECK (question_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- The answer in the shape its question type needs (checked by the API, which knows the question)
  value         jsonb       NOT NULL,
  source        text        NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'website', 'listing', 'document')),
  source_ref    text        CHECK (length(source_ref) <= 500),
  status        text        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('check', 'confirmed')),
  confirmed_by  jsonb,
  confirmed_at  timestamptz,
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, question_key),
  -- Confirmed means someone confirmed it, and when
  CONSTRAINT business_answers_confirmed_has_time CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL))
);
CREATE TRIGGER business_answers_set_updated_at BEFORE UPDATE ON app.business_answers
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.business_answers');

-- Defence in depth: business code can add an answer and change the editable columns only. It can never delete an answer and
-- never change the business, the question or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.business_answers FROM app_user;
GRANT INSERT (account_id, question_key, value, source, source_ref, status, confirmed_by, confirmed_at, created_by,
              updated_by, created_at, updated_at)
  ON app.business_answers TO app_user;
GRANT UPDATE (value, source, source_ref, status, confirmed_by, confirmed_at, updated_by, updated_at)
  ON app.business_answers TO app_user;

CREATE TABLE app.situations (
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  -- The situation's key from the list in code, for example "discount_request"
  situation_key text        NOT NULL CHECK (situation_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  -- The chosen handling's key from that situation's choices in code
  choice        text        NOT NULL CHECK (choice ~ '^[a-z][a-z0-9_]{1,79}$'),
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, situation_key)
);
CREATE TRIGGER situations_set_updated_at BEFORE UPDATE ON app.situations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.situations');

REVOKE INSERT, UPDATE, DELETE ON app.situations FROM app_user;
GRANT INSERT (account_id, situation_key, choice, created_by, updated_by, created_at, updated_at)
  ON app.situations TO app_user;
GRANT UPDATE (choice, updated_by, updated_at) ON app.situations TO app_user;
