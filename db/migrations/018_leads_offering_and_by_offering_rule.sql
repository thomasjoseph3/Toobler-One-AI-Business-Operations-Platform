-- F17 slice 6: a lead can say which offering it is about, and new leads can be shared out BY OFFERING.
--
-- 1. leads.offering_id points at an offering of the SAME business (a composite foreign key, like a lead's owner). An offering that is
--    removed later is only hidden (soft delete), so a lead keeps pointing at it and its history stays readable.
-- 2. The sharing-out rule gets a third mode, 'by_offering': the person who looks after the lead's offering gets the lead; a lead about
--    no offering, or about an offering nobody looks after, goes to one named fallback person. The fallback is stored in the rule's
--    existing user_id column (the same idea as 'one_person': "who gets a lead when nothing else decides").

ALTER TABLE app.leads ADD COLUMN offering_id uuid;
ALTER TABLE app.leads ADD CONSTRAINT leads_offering_same_business_fkey
  FOREIGN KEY (account_id, offering_id) REFERENCES app.offerings (account_id, id);
CREATE INDEX leads_by_offering ON app.leads (account_id, offering_id) WHERE deleted_at IS NULL AND offering_id IS NOT NULL;
-- The app role can set it when adding a lead and change it afterwards (the column grants of migration 010 listed the columns one by one)
GRANT INSERT (offering_id) ON app.leads TO app_user;
GRANT UPDATE (offering_id) ON app.leads TO app_user;

ALTER TABLE app.assignment_rules DROP CONSTRAINT assignment_rules_mode_check;
ALTER TABLE app.assignment_rules
  ADD CONSTRAINT assignment_rules_mode_check CHECK (mode IN ('one_person', 'round_robin', 'by_offering'));
-- 'one_person' and 'by_offering' both need their person
ALTER TABLE app.assignment_rules
  ADD CONSTRAINT assignment_rules_person_needed CHECK (mode = 'round_robin' OR user_id IS NOT NULL);
