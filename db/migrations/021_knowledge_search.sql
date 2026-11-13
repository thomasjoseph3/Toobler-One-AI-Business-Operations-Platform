-- F18 slice 5: search over FAQs, with Postgres full-text search (finds words and their forms: "park", "parking", "parked") and
-- trigram matching (finds a word with a typo: "parkng"). No vectors: see docs/features/F18-faqs-and-unanswered-questions.md.
--
-- The search reads the `faqs` table directly. A separate copy of every FAQ (the "passages" table the brief mentioned) is not needed
-- until documents arrive, and keeping a copy in step would be four places for a bug (add, edit, remove, status change).

-- The extension lives in the `app` schema, which is the schema every connection of ours looks in
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA app;

-- What full-text search looks at: the question counts most (weight A), the answer less (weight B). The database keeps it up to date
-- itself whenever the question or answer changes.
ALTER TABLE app.faqs ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', question), 'A') || setweight(to_tsvector('english', answer), 'B')
) STORED;

-- Only usable FAQs are ever searched, so only they are indexed
CREATE INDEX faqs_search_vector ON app.faqs USING gin (search_vector) WHERE deleted_at IS NULL AND status = 'confirmed';
CREATE INDEX faqs_question_trigram ON app.faqs USING gin (question gin_trgm_ops) WHERE deleted_at IS NULL AND status = 'confirmed';
