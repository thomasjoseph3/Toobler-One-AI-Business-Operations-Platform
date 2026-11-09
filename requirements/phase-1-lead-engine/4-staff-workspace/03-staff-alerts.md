# Staff alerts and the morning summary

**Phase 1 · Staff workspace · HubSpot equivalent: Notifications, Lead assignment alerts**

## What it is

The system tells staff about things that need them, on WhatsApp (with email as a back-up), so they don't have to keep
the app open.

| Alert | Sent when | To |
| --- | --- | --- |
| Hot lead | A lead becomes hot | Lead's owner, or the alert number |
| Callback due | 15 minutes before a callback task | Task's owner |
| Callback late | 15 minutes after, still not done | Manager |
| Needs a person | Customer asked for a person, or a complaint | Alert number |
| Morning summary | At opening time | Manager: overnight leads by temperature, late tasks |

## Why it matters

A hot lead called back in 5 minutes is far more likely to buy than one called back in an hour.

## How it works

1. A hot lead arrives at 3 PM. Within a minute the owner gets a WhatsApp: "Hot lead: Priya, 4 people, 12–15 Dec,
   asked price. Tap to call." with a link to the lead.
2. Each person can turn kinds of alerts off in their own settings, except the ones a manager makes required.

## Rules

- No alert outside office hours unless the business turns night alerts on.
- One alert per event; repeats are grouped.

## Done when

- [ ] Each alert kind arrives within one minute on WhatsApp, and by email if WhatsApp fails.
- [ ] Turning an alert kind off stops it for that person.

## For developers

- **Code folder:** `apps/api/src/core/notifications`
- **API:** [API.md](../../API.md), Phase 1 → Staff alerts and the morning summary
- **Templates:** WhatsApp `new_lead_alert`, `callback_reminder`, `callback_late`, `morning_summary`; email as fallback.
- **Tables:** `notifications`; new `alert_preferences` (`user_id`, `account_id`, `kind`, `on`).
- **Jobs:** morning summary at each business's opening time in the job runner.
