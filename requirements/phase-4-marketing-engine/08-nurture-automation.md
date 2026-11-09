# Nurture automation

**Phase 4 · Marketing · HubSpot equivalent: Marketing automation, Nurture Agent, Lead nurturing workflows**

## What it is

Automatic message series for people not ready to buy yet: cold leads, past customers, newsletter sign-ups. The AI
writes each message for the person, from what they asked before.

## How it works

1. A cold lead asked about weddings "maybe next year".
2. Nurture: a WhatsApp in 1 month with wedding photos, an email in 3 months, a check-in at 6 months.
3. When they reply with interest, they're scored again and go back to sales.

## Done when

- [ ] Nurture series run on time, stop on reply, and hand warm replies back to sales.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/nurture`
- **API:** [API.md](../API.md), Phase 4 → Nurture automation
- **Code:** built on Phase 2 sequences with marketing consent checks; becomes a workflow template in Phase 5.
