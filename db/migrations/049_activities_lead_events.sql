-- F07 slice 4: stage changes and new leads on the timeline.
--
-- The timeline now also holds lines the system writes by itself when something happens to a lead: "lead_created" (a lead was added) and
-- "stage_changed" (a lead moved from one stage to another). They are written by the activities module when the leads module's events
-- arrive (never by a route), so the leads module never has to know the timeline exists.
-- `details` holds the facts of the line in small JSON (the stage names as they were then, the lost reason): never personal data.
-- `source_event_id` is the event that caused the line. Events can be delivered more than once, so a second delivery finds the line
-- already there (the unique key) and writes nothing.

ALTER TABLE app.activities DROP CONSTRAINT activities_kind_check;
ALTER TABLE app.activities ADD CONSTRAINT activities_kind_check CHECK (kind IN ('note', 'lead_created', 'stage_changed'));

ALTER TABLE app.activities ADD COLUMN details jsonb;
ALTER TABLE app.activities ADD COLUMN source_event_id uuid;

-- One line per event (an ordinary note has no event)
CREATE UNIQUE INDEX activities_one_line_per_event ON app.activities (account_id, source_event_id) WHERE source_event_id IS NOT NULL;

-- Business code may add the two new columns when it adds a line; it still cannot change them afterwards
GRANT INSERT (details, source_event_id) ON app.activities TO app_user;
