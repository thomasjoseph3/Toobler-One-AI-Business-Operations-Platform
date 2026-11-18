# F23 Staff alerts and the morning summary

**Status:** in_progress · **Branch:** `feature/F23-staff-alerts` (from `feature/F22-today-page`) · **Requirement:**
`requirements/phase-1-lead-engine/4-staff-workspace/03-staff-alerts.md`

The system tells staff about things that need them — a hot lead, a callback due or late, a customer asking for a person
— on WhatsApp, with email as a back-up, plus a morning summary for managers at opening time.

## Alert kinds (requirement table)

| Kind | Sent when | To (audience) |
| --- | --- | --- |
| `hot_lead` | a lead becomes hot | the lead's owner |
| `callback_due` | 15 min before a callback task | the task's owner |
| `callback_late` | 15 min after, still open | the managers |
| `needs_person` | a customer asks for a person, or a complaint | the alert number (**required**, cannot be turned off) |
| `morning_summary` | at opening time | the managers (overnight leads by temperature, late tasks) |

## Rules

- No alert outside office hours unless the business turned **night alerts** on. The morning summary runs at opening
  time, so it is not gated.
- One alert per event; repeats are grouped.
- Each person turns optional kinds off in their own settings; `needs_person` is always on.

## Built so far (this slice)

- **`helpers/alert-rules.ts` (pure, unit-tested — 11 tests):** `decideAlert` (optional-off, required-always,
  office-hours gating, night-alerts override, morning-summary not gated), `isWithinOfficeHours` / `localMinutesOfDay`
  (business-time-zone), `REQUIRED_ALERT_KINDS`, `audienceForAlert`. Module skeleton `core.notifications`.

## Remaining slices

- **Migration 071:** `app.notifications` (recipient, kind, lead/task/conversation ids, channel, status, read_at, a
  group key); `app.alert_preferences` (`account_id`, `user_id`, `kind`, `is_on`); office-hours columns on `accounts`
  (`opens_at`, `closes_at`, `night_alerts_on`, `alert_phone_e164`, `alert_email`). Reuses F08's
  `task_reminder_minutes` / `task_late_alert_minutes` (051) for the callback timings.
- **Event handlers:** `lead.updated`→hot (becomes hot), conversation type → `needs_person` (complaint / wants a
  person); the tasks module already queues reminders/late alerts (F08) — hook `callback_due` / `callback_late` to them.
- **Delivery:** until WhatsApp (F25) is built, alerts go out by the existing mail/console sender (email fallback is the
  live path now); F25 switches the channel to WhatsApp.
- **Morning-summary job** at each business's opening time (job runner).
- **Routes:** `GET/PATCH /alert-preferences` (My alerts), business alert settings (Settings → Promises and alerts),
  `GET /notifications`. Each with works / 401 / 403 / 404 / 400 and an isolation entry.
- **Front end:** Settings → Promises and alerts, My alerts.

## Tests (lean)

Each alert kind once; off means off; a required kind cannot be turned off; the night rule (fake clock); the
morning-summary schedule. Pure rules are unit-tested now; the event handlers and routes get API tests as they are
built. Full `npm run verify` runs at hand-off.
