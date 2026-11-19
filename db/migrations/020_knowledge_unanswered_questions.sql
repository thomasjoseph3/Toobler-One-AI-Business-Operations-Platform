-- F18 slice 3: questions customers asked that the AI could not answer, grouped, with how often each was asked.
--
-- One row per question per business (the "group key" is the question tidied: capitals, punctuation and spaces removed), so asking the
-- same thing again adds one to `count` instead of a new row. A row ends in one of three states: open (nobody has dealt with it),
-- answered (an FAQ was made from it) or ignored. Personal details (emails, phone numbers) are blanked out before a question is saved.

CREATE TABLE app.unanswered_questions (
  id            uuid PRIMARY KEY,
  account_id    uuid        NOT NULL REFERENCES app.accounts (id),
  -- The question as first asked, with personal details blanked out
  question      text        NOT NULL CHECK (length(question) BETWEEN 1 AND 300),
  -- The question tidied for grouping: the same question asked in different words of capitals or punctuation lands on one row
  group_key     text        NOT NULL CHECK (length(group_key) BETWEEN 1 AND 300),
  count         integer     NOT NULL DEFAULT 1 CHECK (count >= 1),
  last_asked_at timestamptz NOT NULL DEFAULT now(),
  answered_at   timestamptz,
  -- The FAQ made from this question (slice 4)
  faq_id        uuid,
  ignored_at    timestamptz,
  created_by    jsonb,
  updated_by    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One row per question per business, so a second ask is a count, not a copy
  CONSTRAINT unanswered_questions_one_per_question UNIQUE (account_id, group_key),
  -- The FAQ must belong to the same business (an empty faq_id skips this check)
  CONSTRAINT unanswered_questions_faq_same_business_fkey
    FOREIGN KEY (account_id, faq_id) REFERENCES app.faqs (account_id, id),
  -- Answered exactly when it points at an FAQ, and never both answered and ignored
  CONSTRAINT unanswered_questions_answered_has_faq CHECK ((answered_at IS NULL) = (faq_id IS NULL)),
  CONSTRAINT unanswered_questions_one_outcome CHECK (answered_at IS NULL OR ignored_at IS NULL)
);
-- The open list: most asked first
CREATE INDEX unanswered_questions_open ON app.unanswered_questions (account_id, count DESC, last_asked_at DESC)
  WHERE answered_at IS NULL AND ignored_at IS NULL;
CREATE TRIGGER unanswered_questions_set_updated_at BEFORE UPDATE ON app.unanswered_questions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.unanswered_questions');

-- Defence in depth: business code can add questions and change the counting and outcome columns only. It can never delete a row and
-- never change the business, the question words or who created it.
REVOKE INSERT, UPDATE, DELETE ON app.unanswered_questions FROM app_user;
GRANT INSERT (id, account_id, question, group_key, count, last_asked_at, created_by, updated_by, created_at, updated_at)
  ON app.unanswered_questions TO app_user;
GRANT UPDATE (count, last_asked_at, answered_at, faq_id, ignored_at, updated_by, updated_at)
  ON app.unanswered_questions TO app_user;
