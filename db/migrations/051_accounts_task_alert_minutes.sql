-- F08 slice 3: when task reminders and late alerts go out. The owner is reminded this many minutes before a task is due, and the managers
-- are told when it is still open this many minutes after. Both start at 15 (the requirement) until the business changes them.

ALTER TABLE app.accounts
  ADD COLUMN task_reminder_minutes smallint NOT NULL DEFAULT 15
    CONSTRAINT accounts_task_reminder_minutes_range CHECK (task_reminder_minutes BETWEEN 1 AND 1440),
  ADD COLUMN task_late_alert_minutes smallint NOT NULL DEFAULT 15
    CONSTRAINT accounts_task_late_alert_minutes_range CHECK (task_late_alert_minutes BETWEEN 1 AND 1440);
