# Consent and marketing contacts

**Phase 4 · Marketing · HubSpot equivalent: Marketing contacts, Subscription types, GDPR consent**

## What it is

A record, per contact and per channel, of whether they agreed to receive marketing, when and how, and an easy way to
stop. Only contacts who agreed can be sent campaigns.

## Why it matters

Sending marketing without consent breaks Meta's WhatsApp rules (the number gets blocked), India's TRAI rules for SMS
and calls, and the DPDP Act. It also annoys customers.

## How it works

1. Forms, chats and the AI ask "Can we send you offers on WhatsApp?" and record the answer.
2. Every marketing message has "Reply STOP to stop". STOP is recorded at once.
3. Imported contacts start as "not asked".

## Rules

- No campaign can be sent to a contact without consent for that channel.
- Service messages (alerts about their own order) don't need marketing consent.

## Done when

- [ ] Consent is recorded per channel with source and time; STOP works on every channel.
- [ ] Campaign sending skips everyone without consent, with a test proving it.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/consent`
- **API:** [API.md](../API.md), Phase 4 → Consent and marketing contacts
- **Agent tool:** `record_consent`.
- **Tables:** `contact_consents` (`contact_id`, `channel`, `status`, `source`, `at`).
- **SMS:** DLT registration of sender ID and templates (India).
