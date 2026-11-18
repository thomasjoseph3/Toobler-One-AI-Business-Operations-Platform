-- F23: staff alerts and the morning summary.
-- The business's office hours and where "needs a person" alerts go sit on the account; each person's on/off choices in
-- alert_preferences (a missing row means on); the alerts that have gone out in notifications (repeats of one event are
-- grouped into one row so a burst is a single alert). Delivery is WhatsApp with email as a back-up (F25 adds WhatsApp;
-- until then alerts go out by email/console). Office hours also give F22's "overnight"/"closing" their real times.

-- Office hours (the business's local time) and the alert contact for "needs a person".
ALTER TABLE app.accounts
  ADD COLUMN opens_at         time        NOT NULL DEFAULT '09:00',
  ADD COLUMN closes_at        time        NOT NULL DEFAULT '18:00',
  ADD COLUMN night_alerts_on  boolean     NOT NULL DEFAULT false,
  ADD COLUMN alert_phone_e164 text        CHECK (alert_phone_e164 IS NULL OR alert_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN alert_email      text        CHECK (alert_email IS NULL OR length(alert_email) BETWEEN 3 AND 254),
  ADD CONSTRAINT accounts_office_hours_in_order CHECK (closes_at > opens_at);

-- Each person's on/off choice for an optional alert kind. No row means on (alerts start on). A manager keeps the
-- required kinds (needs_person) on for everyone, so those are not stored here.
CREATE TABLE app.alert_preferences (
  account_id uuid        NOT NULL REFERENCES app.accounts (id),
  user_id    uuid        NOT NULL REFERENCES app.users (id),
  kind       text        NOT NULL CHECK (kind IN ('hot_lead', 'callback_due', 'callback_late', 'morning_summary')),
  is_on      boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id, kind)
);
CREATE TRIGGER alert_preferences_set_updated_at BEFORE UPDATE ON app.alert_preferences
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.alert_preferences');

-- One alert that went out: who it is for, what kind, what it is about, how it was sent, and whether it has been read.
CREATE TABLE app.notifications (
  id              uuid        PRIMARY KEY,
  account_id      uuid        NOT NULL REFERENCES app.accounts (id),
  -- The recipient. Null when the alert went to the business's alert number (needs_person), not to a person.
  user_id         uuid        REFERENCES app.users (id),
  kind            text        NOT NULL CHECK (kind IN ('hot_lead', 'callback_due', 'callback_late', 'needs_person', 'morning_summary')),
  lead_id         uuid,
  task_id         uuid,
  conversation_id uuid,
  channel         text        NOT NULL CHECK (channel IN ('whatsapp', 'email', 'console')),
  status          text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  -- The same for repeats of one event, so a burst is grouped into one row (its count goes up) instead of many alerts.
  group_key       text        NOT NULL CHECK (length(group_key) BETWEEN 1 AND 200),
  grouped_count   integer     NOT NULL DEFAULT 1 CHECK (grouped_count >= 1),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- A person's own alerts, newest first.
CREATE INDEX notifications_by_user ON app.notifications (account_id, user_id, created_at DESC, id DESC);
-- One row per event within a business, so repeats find it and raise its count instead of adding a row.
CREATE UNIQUE INDEX notifications_group ON app.notifications (account_id, group_key);
CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON app.notifications
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
SELECT app.enable_tenant_rls('app.notifications');
