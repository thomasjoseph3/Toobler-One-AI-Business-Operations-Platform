-- F18 slice 6: the nightly job that joins the same unanswered question asked in different words into one row.
--
-- A joined row is not deleted (business code can never delete a row): it points at the row it was joined into and is hidden from
-- every list. If a customer asks the hidden question again, the count goes to the row it was joined into.

ALTER TABLE app.unanswered_questions ADD COLUMN merged_into_id uuid;
-- Lets a row point at another row of its own business only
ALTER TABLE app.unanswered_questions
  ADD CONSTRAINT unanswered_questions_account_and_id UNIQUE (account_id, id);
ALTER TABLE app.unanswered_questions
  ADD CONSTRAINT unanswered_questions_merged_into_same_business_fkey
  FOREIGN KEY (account_id, merged_into_id) REFERENCES app.unanswered_questions (account_id, id);
ALTER TABLE app.unanswered_questions
  ADD CONSTRAINT unanswered_questions_not_merged_into_itself CHECK (merged_into_id IS NULL OR merged_into_id <> id);

GRANT UPDATE (merged_into_id) ON app.unanswered_questions TO app_user;
