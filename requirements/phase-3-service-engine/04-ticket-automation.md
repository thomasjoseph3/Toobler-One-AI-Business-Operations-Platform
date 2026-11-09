# Ticket automation

**Phase 3 · Service · HubSpot equivalent: Simple ticket automation, Automated customer service**

## What it is

Simple "when this, do that" rules for tickets (until the full workflow builder in Phase 5), and the AI resolving simple
tickets itself.

## How it works

- "When a ticket mentions 'refund', set category Billing and priority High."
- "When a ticket waits on the customer for 3 days, send a reminder; after 7, close it."
- The AI answers "Where is my invoice?" or "What time is check-out?" from the knowledge base and closes the ticket,
  unless the customer says it didn't help.

## Done when

- [ ] Rules fire on test tickets. AI-closed tickets reopen if the customer replies unhappy.

## For developers

- **Code folder:** `apps/api/src/engines/service/ticket-rules`
- **API:** [API.md](../API.md), Phase 3 → Ticket automation
- **Tables:** `ticket_rules` (`trigger`, `conditions`, `actions` jsonb). Reused by the Phase 5 workflow builder.
