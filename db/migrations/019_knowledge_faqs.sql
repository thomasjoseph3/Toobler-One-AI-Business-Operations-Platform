-- F18 slice 1: FAQs, short question and answer pairs the AI may use to answer customers.
--
-- A typed FAQ is the owner's own words, so it is `confirmed` at once. FAQs drafted from a website (F31) will arrive as `check` and
-- stay out of every search until the owner accepts them. FAQs are soft deleted so the history stays readable. Nothing here is
-- about documents: they are on hold (R47).

CREATE TABLE app.faqs (
  id          uuid PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES app.accounts (id),
  question    text        NOT NULL CHECK (length(question) BETWEEN 1 AND 300),
  answer      text        NOT NULL CHECK (length(answer) BETWEEN 1 AND 2000),
  -- Only 'confirmed' FAQs are ever searched or given to the AI
  status      text        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'check')),
  -- Where the FAQ came from: typed by the owner, drafted from the website, or made from an unanswered question
  source      text        NOT NULL DEFAULT 'typed' CHECK (source IN ('typed', 'website', 'unanswered')),
  deleted_at  timestamptz,
  created_by  jsonb,
  updated_by  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Lets other tables point at an FAQ of their own business only (the unanswered questions, in slice 3)
  CONSTRAINT faqs_account_and_id UNIQUE (account_id, id)
);
-- One live FAQ per question in a business, ignoring capitals (the API tidies extra spaces before saving)
CREATE UNIQUE INDEX faqs_question_unique ON app.faqs (account_id, lower(question)) WHERE deleted_at IS NULL;
-- The list, newest first
CREATE INDEX faqs_newest_first ON app.faqs (account_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE TRIGGER faqs_set_updated_at BEFORE UPDATE ON app.faqs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.faqs');

-- Defence in depth: business code can add FAQs and change the editable columns only. It can never delete a row and never change
-- the business or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.faqs FROM app_user;
GRANT INSERT (id, account_id, question, answer, status, source, created_by, updated_by, created_at, updated_at)
  ON app.faqs TO app_user;
GRANT UPDATE (question, answer, status, deleted_at, updated_by, updated_at) ON app.faqs TO app_user;
