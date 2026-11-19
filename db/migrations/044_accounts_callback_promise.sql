-- F31 slice 4: how fast the business promises to call a customer back while it is open (step 8 of the setup wizard). The AI agent says
-- "Our team will call you within N minutes" with this N. Every business keeps today's 15 until its manager changes it.

ALTER TABLE app.accounts
  ADD COLUMN callback_promise_minutes smallint NOT NULL DEFAULT 15
    CONSTRAINT accounts_callback_promise_minutes_range CHECK (callback_promise_minutes BETWEEN 5 AND 120);
