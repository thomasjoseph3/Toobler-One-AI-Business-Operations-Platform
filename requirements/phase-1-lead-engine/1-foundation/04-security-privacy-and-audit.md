# Security, privacy and the activity log

**Phase 1 · Foundation · HubSpot equivalent: Security, audit log, data privacy (GDPR tools)**

## What it is

The protections every business can rely on: their data is kept apart from every other business, every important change
is recorded with who made it, call recordings and personal details are protected, and a customer's data can be
exported or deleted on request.

## Why it matters

A business trusts us with its customers' phone numbers and conversations. One leak would end that trust. India's data
protection law (DPDP Act 2023) also gives customers the right to see and erase their data.

## How it works

1. Every table carries the business's id; the database itself refuses to show rows to anyone else.
2. Every sign-in, setting change, delete, export and support visit goes into the **activity log**, shown to managers.
3. Toobler's support team can see a business's data only when the business grants access, for a set time, and every
   visit is logged.
4. When a customer asks, a manager can download everything held about them, or erase them (with "Are you sure?").
5. Call recordings are kept for a period the business picks (default 90 days), then deleted automatically.

## Rules

- Passwords are never stored in plain text; secrets are never written to logs.
- Erasing a contact removes their name, phone, email, messages and recordings, but keeps anonymous counts for reports.

## Screens

- **Settings → Activity:** who did what, when.
- **Settings → Support access:** grant or end Toobler's access.
- **Contact page → Privacy:** Download data, Erase contact.

## Done when

- [ ] A test proves one business can't read another's contacts, leads, messages or recordings through any route.
- [ ] Every delete and export appears in the activity log.
- [ ] Erasing a contact leaves no personal detail behind.
- [ ] Recordings older than the business's setting are deleted by the nightly job.

## For developers

- **Code folder:** `apps/api/src/core/audit`
- **API:** [API.md](../../API.md), Phase 1 → Security, privacy and the activity log
- **Tables:** `activity_log`, `support_grants`, `support_visits`, `alerts`; `accounts.recording_days`.
- **Data separation:** Row Level Security on every table, keyed on `account_id`; a test per route proves one business
  can't read another's rows.
- **Erase and export:** in `apps/api/src/core/contacts/privacy.ts`; recording cleanup is a nightly job.
