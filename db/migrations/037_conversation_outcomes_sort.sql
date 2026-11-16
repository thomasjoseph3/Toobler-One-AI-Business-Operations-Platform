-- F15 slice 7c (fix): the outcomes of one conversation are saved together, so they share one timestamp and their order was left to chance.
-- Each outcome now has a position (the main type first, then the other reasons in the order the router gave them), and they are listed by it.

ALTER TABLE app.conversation_outcomes ADD COLUMN sort integer NOT NULL DEFAULT 0;
GRANT INSERT (sort) ON app.conversation_outcomes TO app_user;
GRANT UPDATE (sort) ON app.conversation_outcomes TO app_user;
