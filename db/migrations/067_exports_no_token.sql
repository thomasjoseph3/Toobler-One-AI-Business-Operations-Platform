-- F12: an export is downloaded through the manager's own signed-in session (the emailed link opens a page in the app), so no secret link token is needed.
-- Dropping the column keeps the table to what is used.

ALTER TABLE app.exports DROP COLUMN token_hash;
