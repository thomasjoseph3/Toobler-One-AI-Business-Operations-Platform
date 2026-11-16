-- F19 slice 4: the short summary of a conversation (what the customer wanted, what was answered, what was promised), written once a
-- conversation has ended, for the inbox and the timeline. It lives with the other facts the agent learned. It never holds an amount that
-- nobody said (the summary is checked like every answer), and never anything the customer did not say.

ALTER TABLE app.conversation_facts ADD COLUMN summary text CHECK (length(summary) <= 1000);
ALTER TABLE app.conversation_facts ADD COLUMN summarised_at timestamptz;
GRANT INSERT (summary, summarised_at) ON app.conversation_facts TO app_user;
GRANT UPDATE (summary, summarised_at) ON app.conversation_facts TO app_user;
