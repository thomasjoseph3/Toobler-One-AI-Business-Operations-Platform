-- F21: the inbox, staff takeover and live updates.
--
-- A person can take a conversation over from the AI: `held_by_user_id` is that person and `held_until` is when the hold runs out (two hours after
-- their last reply). Both are set or both are empty. The holder must be a person of the SAME business (the composite key checks it).
-- `done_at` is set when staff mark a conversation done; a new customer message clears it.

ALTER TABLE app.conversations
  ADD COLUMN held_by_user_id uuid,
  ADD COLUMN held_until      timestamptz,
  ADD COLUMN done_at         timestamptz;
ALTER TABLE app.conversations ADD CONSTRAINT conversations_hold_complete
  CHECK ((held_by_user_id IS NULL) = (held_until IS NULL));
ALTER TABLE app.conversations ADD CONSTRAINT conversations_holder_same_business_fkey
  FOREIGN KEY (account_id, held_by_user_id) REFERENCES app.users (account_id, id);
-- "Which conversations does this person hold?" and the clean-up of holds that ran out
CREATE INDEX conversations_held ON app.conversations (account_id, held_until) WHERE held_by_user_id IS NOT NULL;
GRANT UPDATE (held_by_user_id, held_until, done_at) ON app.conversations TO app_user;

-- Live updates read a business's newest events (F21): by business and time
CREATE INDEX domain_events_by_time ON app.domain_events (account_id, occurred_at);
