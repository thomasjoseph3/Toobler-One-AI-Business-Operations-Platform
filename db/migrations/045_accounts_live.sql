-- F31 slice 4: when a business went live (started answering real customers). Null means "not live yet": its website chat tells visitors it
-- is not open yet. Set once, by the setup wizard's "Go live" (never by anything else), and kept.
--
-- Every business that exists today is already answering customers, so it is marked live now: nothing stops working.

ALTER TABLE app.accounts
  ADD COLUMN live_at timestamptz,
  ADD COLUMN live_by jsonb;

UPDATE app.accounts SET live_at = now(), live_by = '{"kind":"system","id":"migration-045"}'::jsonb WHERE live_at IS NULL;
